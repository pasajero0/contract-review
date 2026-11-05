# Backend architecture

How `apps/api` is organised. See also: [overview](overview.md), [0006](../adr/archive/0006-modular-monolith-no-job-queue.md), [0008](../adr/archive/0008-guarantees-live-in-the-database.md).

## Event flow

Only the review service changes the database. Everything else passes events to it. There are three sources of events:

```
1) A lawyer acts:      Web --HTTP--> Routes --> Review service --> SQLite
2) An AI event:        Fake AI --> Runner --> Review service --> SQLite
3) Time passes:        Sweeper (timer) --> Review service --> SQLite
```

| Part | Does |
|---|---|
| Routes | HTTP, current lawyer (header), validation, service result to HTTP code. No logic |
| Review service | All rules and writes: request, record finding, complete, fail, expire. Its read side is in `services/reviewQueries.ts`, with one plan count and one definition of the latest review. `createReviewService` stays the single entry point |
| Runner | Runs the AI engine in the background and forwards each event to the service. Decides nothing |
| Fake AI | Returns findings from the JSON with delays; fails and stalls using `random` and `clock` |
| Sweeper | Every `sweepIntervalMs`: "expire overdue reviews" |
| SQLite | 4 tables: `apps/api/src/db/schema.sql` |

**Side effects only after commit.** The runner starts after the request transaction commits. Otherwise a rolled-back request would leave the AI working on a review that does not exist. The service gets an `onStarted` callback, so it does not import the runner and no cycle appears.

## Dependencies are passed in

Everything replaceable goes through a typed `Deps`: `clock`, `random`, `engine`, `db`, `config` (`planLimit`, `reviewTimeoutMs`, `timeZone`, `sweepIntervalMs`), built in `main.ts`. Each part receives only what it uses. Tests replace them with test doubles, with no DI container and no long argument lists.

The fake AI sits behind the `ReviewEngine` port, with the shape a real model client would have: an async iterable, where the stream ending means done and a thrown error means failed. Replacing it does not touch the rest of the code.

## Layers

Arrow = "may import", top to bottom only.

```
main.ts        builds Deps, starts the server and the sweeper      <- the only place that sees everything
   |
   v
http/          Fastify routes: validate input, map domain -> response (DTO)
   |
   v
services/      reviewService (transactions, rules), runner, sweeper
   |                      |
   v                      v
db/            ports/            interfaces: Clock, Random, Logger, ReviewEngine
SQL, schema,     ^
seed             | implement
   |           adapters/         fakeEngine, systemClock, systemRandom, and test doubles
   v                      |
domain/        types and pure functions: statuses, plan calculation, month window, finding order.
               Imports nothing                                     <- bottom
```

`services/` uses the real database, not an interface around it; tests use in-memory SQLite. The index, triggers and transactions are part of the rules, and a database mock would hide exactly what we test.

## Why some imports are forbidden

- `http/` must not import `db/`, so that all writes pass through the service. `http/` may import `domain/` to map domain types to responses.
- `ports/`, `db/` and `adapters/` must not import upward or across.
- `*.test.ts` files are exempt from the layer rules, so tests can use test doubles from `adapters/` and set up data directly. The cycle rule still applies to them.
