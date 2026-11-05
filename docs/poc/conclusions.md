# POC conclusions

What the POC showed, what to do in the real solution, and why. Answers to the plan's questions: `docs/poc/plan.md` §7. Decisions: `docs/adr/decisions.md`. Evidence per stage: the local diary and reports (not in this repository).

State: commit `d7706d5`; 109 tests, `typecheck`, `lint` and `check:deps` pass. Q8 and the POC time are still open (Stage 7).

## Database and rules

| # | Do in the real solution | Why |
|---|---|---|
| 1 | Keep the rules in the database: partial unique index, triggers, conditional updates, `STRICT` tables | Code cannot bypass them. Tests hit these guards directly |
| 2 | Write `failure_reason IS NOT NULL` in the `CHECK` | A `CHECK` passes on NULL: a `failed` review with no reason was accepted until a test caught it |
| 3 | Run a request in one immediate transaction; keep the type of `inTransaction` that rejects async functions | Plan check and insert must not interleave, and an `await` inside now fails `typecheck` |
| 4 | Block `DELETE` on reviews | Deleting a finished review would free a plan slot. `INSERT OR REPLACE` is still not blocked, so do not use it |
| 5 | Use `node:sqlite` for the case; state in the README that it is experimental | It works on Node 22.21.1 with no install, but prints `ExperimentalWarning`. Reconsider it for production |
| 6 | Store time as integer epoch ms, UTC | `deadline_at > now` compares numbers, so format differences cannot break it |

## Review flow

| # | Do in the real solution | Why |
|---|---|---|
| 7 | Start the runner only after commit, through an `onStarted` callback | A rolled-back request must not leave the AI running; the callback also avoids a service and runner cycle |
| 8 | Treat late events as conditional updates that change 0 rows, and log them | The review stays `failed` and the plan is untouched |
| 9 | Show an overdue review as failed on read; let the sweeper persist it, also once at start | The status is right at once, and overdue reviews are written right after a restart |
| 10 | No queue | After `kill -9` and a restart the review failed at 60 s and the document was free. The deadline in the row is enough |
| 11 | Fail the whole review with `ai_error` on an unknown severity | Otherwise a lost finding could show "no issues flagged" |
| 12 | Separate engine errors from database errors in the runner | A database error in `complete` was recorded as `ai_error` |
| 13 | Make a document missing from the engine's map an error (not done in the POC) | Today a wrong id behaves as "no findings" and would read as "no issues" |
| 14 | Follow the whole `supersedes` chain for `currentVersionId` (not done in the POC) | It returns the next version, wrong for v1 <- v2 <- v3. The samples have one link only |

## Time

| # | Do in the real solution | Why |
|---|---|---|
| 15 | Keep our own `ManualClock` in `Deps`, with an async `advance()` | Tests run with no real waiting. With a sync `advance()`, timers set by awaiting code fire late |
| 16 | Use `Intl` for the month window, no library | It handles months with a clock change; Rome and Sofia differ by one hour |

## Contract and API

| # | Do in the real solution | Why |
|---|---|---|
| 17 | Build each response as a typed value, then `parse` it | `parse` accepts `unknown`, so a renamed field compiled and would give a 500. This happened twice |
| 18 | Write HTTP tests that can see extra fields | `parse` strips them, so the first tests could not notice a leak |
| 19 | Keep `POST` returning `201` at once, and the elapsed time based on `serverTime` | The AI takes up to 120 s, and the browser clock cannot be trusted |

## Tooling

| # | Do in the real solution | Why |
|---|---|---|
| 20 | Keep dependency-cruiser with `no-unresolvable` | Forbidden imports and cycles are caught; an import of a missing file slipped past the path rules without it |
| 21 | Exempt `*.test.ts` from layer rules, not from the cycle rule | Tests need test doubles from `adapters/` |
| 22 | Use a Next.js rewrite for `/api/*` | One origin, no CORS. A real browser click returned `201` |
| 23 | Run `next typegen` before `tsc` in web | `typecheck` fails on a clean install without `next-env.d.ts` |
| 24 | Run `shadcn init -b radix -p nova --no-monorepo --no-rtl -y`, then set aliases before `add` | Without `-p` it stops at a prompt, and `init` writes to `src/lib/` |
| 25 | Set `agentRules: false` in Next.js | Otherwise `next dev` generates `AGENTS.md` |
| 26 | Use TypeScript 6.0.3 and `@types/node` 22 | `typescript-eslint` needs TypeScript below 6.1.0; the types must match Node 22 |
| 27 | Run TypeScript directly on Node 22, no `tsx` | It works, so there is one dependency less |
| 28 | Expect peer warnings from `eslint-config-next` | Its plugins do not officially support ESLint 10. Lint works today but could break |

## Testing and process

| # | Do in the real solution | Why |
|---|---|---|
| 29 | Write tests first and watch them fail | This caught the NULL `CHECK` and the `0.2 + 0.1` scenario limit |
| 30 | Break the code on purpose to check that a test catches it | Tests can pass and prove nothing: W4 had nothing to leak, W5 proved no run |
| 31 | Name race tests honestly and add real concurrency tests on Postgres | `node:sqlite` is synchronous on one connection, so calls never interleave in one process |
| 32 | Run a scripted check on real processes | It covered the proxy, restart and timeout, which `inject` tests cannot |
| 33 | Run the code review before calling a stage done | It found the contract bypass (17), which no test caught |
| 34 | Give code to subagents with a narrow brief | Sonnet fixed the review findings for 24k to 34k tokens per agent; the code reviewer cost 116k |

## Not proved by the POC

- A late event on a real server: proved on `ManualClock` only.
- Plan exhaustion on a real server: tested with `inject` only.
- Concurrency at database level (see 31).
- The page without network: `next/font/google` fetches Geist.
- Never built, so still unproved: polling (A10), TanStack Query, finding order, `GET /documents`, `GET /documents/:id`, `GET /quota`, `GET /lawyers`, and shadcn components other than `button`.

## Left for the real solution

- All screens from `docs/specs/`; the POC has one button.
- The API in `docs/specs/`, including finding content.
- The three decisions visible in the UI: D1, D2, D3.
- README and session log, as the brief requires, including AI tools used and time spent.
- Open questions in `docs/poc/plan.md` §8.
