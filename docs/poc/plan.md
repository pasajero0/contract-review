# POC plan

> Throwaway spike before the real solution. Archive: kept as it was run. Ids such as A18, M15 or UC3 come from the former `decisions.md` and `use-cases.md`; `docs/adr/archive/README.md` maps them to their new place. §1 says "no README": one was added after the POC, at the human's request. Working rules: `CLAUDE.md`.

**Status (2026-11-04):** Stages 1–7 are done, except that the session export itself was not made: its format and the personal data in it are known (§7, Q8). See the local diary and reports (not in this repository) for details. Open questions are in §8.

## 1. Goal

Remove the technical risks before building the real solution. **This is not a draft of the solution:** no screens, no README, no full API.

## 2. Scope

- Work one stage at a time; stop when the done criteria pass (see `CLAUDE.md`).
- Minimal code only:
  - schema of 4 tables, the partial unique index and the trigger;
  - review service: request (one transaction), record finding, complete, fail, expire;
  - `Deps`: manual clock for tests, fixed randomness, fake AI engine, in-memory database, `config`;
  - fake AI engine with scenario selection;
  - tests on the rules;
  - one route `POST /documents/:id/reviews` (plus `GET /reviews/:id`) and one Next.js page that calls it.

## 3. Tech (allowed dependencies)

| Area | Choice |
|---|---|
| Workspace | pnpm workspaces, TypeScript strict, Node 22.21.1 pinned in `.nvmrc` |
| Contract | Zod in `packages/contract` |
| API | Fastify; tests through Fastify `inject` (no network) |
| Database | SQLite: try Node's built-in `node:sqlite` first; if it does not work, `better-sqlite3` |
| Tests | Vitest |
| Dates and time zones | `Intl` first. If it is not enough, ask before adding a library (candidates: `date-fns-tz`, `luxon`) |
| Web | Next.js (App Router); shadcn/ui (Tailwind as its engine). TanStack Query is for the final solution, not needed in the POC |
| Quality | ESLint, `tsc --noEmit`, dependency-cruiser |

Not allowed: Docker, ORMs, DI containers, queues (Redis/BullMQ), WebSocket libraries.

Direct dependencies are pinned to exact versions (old id M6). Packages that the tools above need are allowed; anything else needs asking first.

## 4. Repository layout

```
apps/
  api/src/
    main.ts        composition root: builds Deps, starts server and sweeper
    http/          Fastify routes; validate with contract schemas; domain -> DTO
    services/      reviewService, runner, sweeper
    db/            connection, schema.sql, seed, queries
    ports/         Clock, Random, ReviewEngine interfaces
    adapters/      fakeEngine, systemClock, systemRandom
    domain/        types and pure functions (statuses, quota, month window, sorting)
  web/src/
    app/           pages
    features/      lawyer, quota, documents, review
    api/           fetch client (adds X-Lawyer-Id), error mapping
    ui/            shadcn components (generated)
packages/
  contract/        Zod schemas for API requests and responses, types via z.infer
samples/
  documents.json
  lawyers.json
```

## 5. Stages

### Stage 1 — Scaffold · Q7, Q9, Q10, Q11 · **done**
- pnpm monorepo with `apps/api` (Fastify, TypeScript, Vitest), `apps/web` (minimal Next.js), `packages/contract` (Zod, one trial schema used by both apps).
- `shadcn init` in `apps/web`; components go to `src/ui/`; add `button` only.
- dependency-cruiser with the layer rules.
- Scripts at the root: `dev`, `test`, `typecheck`, `lint`, `check:deps`.
- **Done when:** `pnpm install && pnpm test` passes with one trivial test; `pnpm dev` starts both apps; `pnpm check:deps` passes; a deliberately forbidden import (e.g. `apps/web` → `apps/api`) makes `pnpm check:deps` fail (then remove it).

### Stage 2 — Database · Q1 · tests first
- Try `node:sqlite`; fall back to `better-sqlite3`. Record which one and why.
- Tables `lawyers`, `documents`, `reviews`, `findings` (see old id §C).
- Partial unique index: at most one `running` review per document.
- Trigger: a `completed` or `failed` review cannot be updated; findings cannot be inserted for it. The facts of any review cannot be updated; findings cannot be updated or deleted (old id M16).
- Timestamps are integer epoch milliseconds, UTC (old id M15).
- Seed from `samples/`.
- **Done when tests pass:** a second `running` review for the same document fails on the index; updating a completed review fails on the trigger; updating the facts of a `running` review fails on the trigger; updating or deleting a finding fails on the trigger; a conditional update (`... WHERE status = 'running' AND deadline_at > :now`) on a finished review changes 0 rows; the seed loads 3 lawyers and 13 documents.

### Stage 3 — Time and config · Q4, Q5
- `Clock` interface (`now()`, `setTimeout`, `clearTimeout`) and a `ManualClock` for tests (`advance(ms)` runs due timers in order).
- `Random` interface and a fixed/seeded implementation for tests.
- `config`: `planLimit = 10`, `reviewTimeoutMs = 60000`, `timeZone = 'Europe/Rome'`, `sweepIntervalMs = 5000`.
- Pure function: start and end of the calendar month that contains an instant, in a given IANA time zone.
- **Done when tests pass, with no real waiting:** 2026-10-31 23:30 Europe/Rome is in October; 2026-11-01 00:10 Europe/Rome is in November; the month boundary for `Europe/Sofia` is one hour earlier in UTC than for `Europe/Rome`.

### Stage 4 — Review service · Q2, Q3 · tests first
- `requestReview(documentId, lawyerId)` in **one transaction, with no `await` inside**:
  1. mark overdue `running` reviews as `failed` / `timeout`, `finished_at = deadline_at`;
  2. the document exists and is not superseded;
  3. no `running` review for the document, otherwise reject with who started it and when;
  4. plan check (R1);
  5. insert a `running` review with `deadline_at = requested_at + reviewTimeoutMs`;
  6. commit, then start the runner.
- `recordFinding`, `complete`, `fail`, `expireOverdue`.
- Plan: `available = planLimit − count(reviews requested this month that are completed, or running with deadline not passed)`.
- **Done when tests pass:** second request while running → rejected; 9 completed + 1 running → rejected (reservation); failed reviews do not count; a finding or completion after the deadline is dropped and does not consume the plan; a retry after a failure creates a new review and the old one stays `failed`; an overdue `running` review does not block a new request.
- **Review focus:** there is no `await` inside the transaction.

### Stage 5 — Fake AI engine and runner · Q4 · tests first
- Fake engine (`ReviewEngine`): picks a scenario with `random` at start — about 1 in 5 fails with an error after k findings (k from 0 to n); about 1 in 10 is slow (total 60–120 s); otherwise total 5–30 s. Returns the document's findings from `samples/documents.json` one at a time, in JSON order, spread over the total time, using `clock`.
- Runner: starts the engine after commit and forwards each event to the review service. Decides nothing.
- Sweeper: every `sweepIntervalMs` calls `expireOverdue`.
- Late events are dropped and logged (e.g. "completion arrived 4s after deadline, dropped").
- **Done when tests on `ManualClock` pass instantly:** normal scenario completes with all findings; "fail after 2nd finding" → `failed` / `ai_error` with 2 findings; slow scenario → `failed` / `timeout` at 60 s, completion at 70 s is dropped and logged; a document with no findings completes with 0 findings.

### Stage 6 — HTTP and wiring · Q6, Q7, Q9
- `POST /documents/:id/reviews` and `GET /reviews/:id`, request and response shapes from `packages/contract`. Lawyer from header `X-Lawyer-Id`.
- Test: two concurrent POSTs for the same document → one `201`, one `409` with code `review_in_progress`.
- A shadcn button on a Next.js page calls the API through a Next.js rewrite (proxy, no CORS) and shows the response.
- Manual check (by me): start a review, kill the API, start it again → after 60 s the review is `failed` / `timeout` and the document is free.

### Stage 7 — Wrap-up (me) · Q8
- Fill in §7. Export the session and check it for personal data.

## 6. Questions and defaults

| # | Question | Done when | Priority | Default if not answered |
|---|---|---|---|---|
| Q1 | SQLite driver: `node:sqlite` or `better-sqlite3` | Installs and tests pass without native build errors; one chosen | must | `node:sqlite` if it works on our Node, else `better-sqlite3` |
| Q2 | Races | Of two concurrent requests for one document, or for the last plan slot, exactly one succeeds | must | — |
| Q3 | Conditional updates | Late finding and completion change 0 rows; review stays `failed`; plan untouched | must | — |
| Q4 | Controlled time | Tests are deterministic, no real waiting, under 1 s; approach chosen (own `ManualClock` vs Vitest fake timers) | must | own `ManualClock` in `Deps` |
| Q5 | Month boundary in workspace time zone | Month is correct; Rome and Sofia differ by one hour | must | a small time-zone library |
| Q6 | Runner after commit; restart | Review is persisted as `failed` / `timeout`, document free | should | — |
| Q7 | Next.js ↔ API | One command starts both; the page gets the API response through the proxy | should | Next.js rewrite, no CORS |
| Q8 | Claude Code session export | Format known; personal data identified and removable | at the end | — |
| Q9 | Types from `packages/contract` | API and web compile against the same schema; changing it breaks both builds | should | — |
| Q10 | Dependency rules | `pnpm check:deps` catches a forbidden import and a cycle | should | rules stay in `CLAUDE.md`, checked in review |
| Q11 | shadcn in the monorepo | `shadcn init` and `add button` work in `apps/web` under pnpm | should | add components by hand from the shadcn docs |

## 7. Results (fill in after the POC)

| # | Answer | Decision | What changes in the real solution |
|---|---|---|---|
| Q1 | `node:sqlite` works on Node 22.21.1 under Vitest with no install; it prints `ExperimentalWarning` | `node:sqlite` | Reconsider: it is still marked experimental |
| Q2 | Yes for the logic: of two requests for one document or for the last slot, exactly one succeeds. `node:sqlite` is synchronous on one connection, so requests in one process never interleave; the partial unique index is the real guard, tested directly in Stage 2 | Immediate transaction, no `await` inside; the type of `inTransaction` rejects async functions | Postgres needs real concurrency tests and a row lock |
| Q3 | Yes: a late finding, completion or failure changes 0 rows and is logged; the review is not completed and the plan is untouched | Conditional updates | Keep them |
| Q4 | Yes: own `ManualClock` in `Deps`. `advance()` must be async and let awaiting code continue after each timer, or timers set by that code fire late | Own `ManualClock`, async `advance()` | Keep it |
| Q5 | Yes: `Intl` is enough, including months with a clock change. Rome and Sofia differ by one hour | `Intl`, no library | Keep it; add a library only if more date work appears |
| Q6 | Yes, on real processes: `kill -9` during a review, restart on the same file; the review reads `running`, then `failed` / `timeout` after 60 s, the sweeper persists it and the document is free. The human's manual check on 2026-11-04 confirmed it: the review's deadline passed while the API was down, and on restart, 5 s later, the review was `failed` / `timeout` with `finished_at = deadline_at`. That run did not show the `running` read after restart; only the script did | Database file, seed that can run twice, deadline stored in the row | Keep it; no queue needed for restart |
| Q7 | Yes: `pnpm dev` starts both; `/api/*` goes through a Next.js rewrite, no CORS. A real browser click on 2026-11-04 returned `201` with a `reviewId`, and that review completed with 3 findings. A click during a running review returned `409` with `review_in_progress`, who started it and when | Next.js rewrite | Keep it |
| Q8 | Format known: one JSONL file per session in `~/.claude/projects/<project>/`, here 3 files. The email and full name appear in `attachment` and `api-request-blob` records (the session's context), not in what was said, apart from one scan command. The home path is in most records. A scan for `sk-ant`, `ghp_` and `password` found no real values. The export itself was not made yet | Export only `user` and `assistant` text, replace the home path, and read the result before sharing | Do not share raw JSONL. Decide whether the brief's text and company name stay in the log |
| Q9 | Yes: renaming a schema field fails `typecheck` in both apps. The first attempt failed only in web, because `Health.parse()` accepts any input; the API must build a typed value first | Build responses as typed values, then parse | API routes need a typed value before `parse` |
| Q10 | Yes: forbidden imports and a cycle are caught, including `import type` and `@/` aliases. An unresolvable import slipped past path rules until `no-unresolvable` was added | Keep dependency-cruiser | Keep the rules; keep `no-unresolvable` |
| Q11 | Yes: `shadcn@4.23.0 init -b radix -p nova --no-monorepo --no-rtl -y` works. Without `-p` it stops at a prompt. `init` writes `src/lib/utils.ts`, so it was moved and the aliases in `components.json` were changed before `add button` | Keep shadcn; components in `src/ui/` | Set the aliases right after `init` |

**Surprises and pitfalls:**
- `pnpm typecheck` failed on a clean install because `next-env.d.ts` did not exist yet. Web's script now runs `next typegen` first.
- `eslint-config-next` 16.4.5 pulls plugins that do not officially support ESLint 10 (peer warnings). Lint works today, but this could break later.
- `next dev` generates `AGENTS.md` unless `agentRules: false` is set.
- The harness's install guard asks for confirmation on `pnpm install && pnpm test`, reading `&&` as a package name.
- The harness's default `strict` spec gate blocks all code in a repository with no commits, including the scaffold.

**Where the agent was wrong:**
- Turned 4 done criteria into a 29-criterion spec for the scaffold, which was thrown away.
- Suggested `S1-scaffold` as a spec name; a number reads like a version, and specs are edited in place.
- Changed its recommendation on `AGENTS.md` twice.

## 8. Open questions

Found while reviewing these docs. Each shows the agent's proposal at the time. **Since settled:** the first by ADR 0015 (no button), the second by ADR 0016 (validate with Zod, against the proposal), the third by `stagePattern` `^f-([a-z-]+)$`.

| Stage | Question | Proposal |
|---|---|---|
| — | UC3c says the button is disabled for a superseded version; UC9 says there is no button | Follow UC9 |
| — | §L says the web app uses the contract as "types only"; A15 says it may validate responses | Types only for the POC |
| — | Spec folder naming needs a branch pattern in `.claude/gates.json` (old id M4) | `f-<feature>`, folder `docs/specs/<feature>/`; tested on sample names only, not in the hooks |
