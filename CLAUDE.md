# Contract review — working rules

Read these first, in this order:
1. `CODEMAP.md` — where everything lives.
2. "Stages" below — what is left to build.
3. `docs/specs/` — how each feature behaves, backend and frontend.
4. `docs/adr/decisions.md` — why: architecture, domain rules, product decisions. Originals: `docs/adr/archive/`.
5. `docs/architecture/` — how the code is organised.

The POC is finished (tag `poc-end`, archive in `docs/poc/`). We build the final solution on it (ADR 0014).

## Stages

Each stage is one commit. The agent stops and shows the result after stages 4, 7 and 9.

| # | Stage | Done when |
|---|---|---|
| 0 | Start: tag, decisions, dependencies | Done |
| 1 | Contract: split by subject, describe routes, check subpath imports | Renaming a field fails `typecheck` |
| 2 | API `request-review`: `canRequest`, `GET /documents/:id`, AC ids in tests | `trace request-review` links every Backend criterion |
| 3 | API `read-result`: findings, sorting, `latestCompleted` | Content only for `completed` |
| 4 | API `documents-list`: `GET /documents`, `/quota`, `/lawyers` | Every Backend criterion passes |
| 5 | Screen `documents-list` | The human clicked through it |
| 6 | Screen `request-review` | The human saw success, failure and timeout |
| 7 | Screen `read-result` | The human read a result |
| 8 | Final check: one `code-reviewer`, fixes, every scenario in a browser, plan exhaustion and a late event on a real server, and the "To check in manual testing" list of each spec | All checks pass; each listed decision confirmed or changed by the human |
| 9 | Hand-in: README as the brief requires, cleaned session log | The human read everything and pushes |

If time runs short, cut screen tests first. Never cut the brief's rules, the three disputed decisions, the README or the log. The log keeps the agent's mistakes; only personal and confidential data is removed.

## How we work

- Work **one stage at a time** from "Stages" above. Feature stages use a branch `f-<feature>`.
- **Keep reports short:** a TLDR in bullets, "Done: ..." then "Questions: ...". The human asks to expand anything unclear.
- At the end of each stage, the report also names the commands run with their result, and **"Decisions not in plan"**: anything decided that the docs do not cover.
- Commits: one stage = one commit, with generated shadcn components in their own commit (`docs/adr/archive/0013-tooling-choices.md`). The agent may commit a finished stage. Never push.
- Commit description: bullets saying what was done and, where useful, why.
- Diary: `.claude/tmp/poc-diary.md` (local, not in the repository), written during each stage: what was done, difficulties and mistakes, decisions not in the plan, what may not work.
- **Tests first, through subagents.** `test-writer` writes failing tests from the spec's criteria, named `<feature> AC-n: …`. `implementer` then writes the code. The main session plans and reviews.
- **Never change a test to make it pass.** If a test looks wrong, stop and explain why.
- Dependencies: only the ones allowed in `docs/poc/plan.md` §3 and ADR 0017, at exact versions. Ask before adding anything else. Prefer a proven library to hand-written code.
- No Docker.
- **Final solution: mechanics first.** Screens stay minimal from the start: shadcn defaults and basic layout, no visual polish. Keep what carries behaviour or a product decision: exact on-screen texts, disabled buttons, the confirmation dialog, and labels that keep old or partial results from reading as final.
- English everywhere in the repository: code, comments, commit messages, docs.
- If the docs are unclear or contradict each other, stop and ask. Do not guess.

## Documentation

All documents live in `docs/`; only `README.md`, `CLAUDE.md` and `CODEMAP.md` sit in the root. Each fact lives in one place. What the code already says is not repeated in docs.

- **Decisions (`docs/adr/decisions.md`):** why a decision was made, in one file, edited in place. **`docs/adr/archive/`:** the original records with their final status; the text is not edited, and specs cite them by number.
- **Spec (`docs/specs/<feature>/SPEC.md`):** one feature, edited in place; the code changes after the spec. One file: purpose, Decisions table (ADR, date, what it means here), Backend, Frontend. A status code goes under Backend, a text on screen under Frontend. A criterion that follows from a decision cites it (`ADR-0003`). Folders are named after the feature, not numbered: a number reads like a version. Do not split a spec into several files: `spec-gate` and `trace` read only `SPEC.md`.
- **Only for real behaviour.** No spec for mechanical work such as the scaffold: its facts live in the code and configs. A 29-criterion scaffold spec and its review were written and thrown away; the plan's 4 done criteria were enough.
- **Contract (`packages/contract`):** the only place for API shapes. Once a shape is built, a spec only names it.
- **`docs/architecture/`:** how the code is organised: overview, backend, frontend. **`CODEMAP.md`:** the map; link every new spec from it. **`docs/poc/`:** the POC archive.
- No other Markdown files. Details: `.claude/rules/docs-layout.md`.
- `specGate` is `stage`: code is open on `main`, and the gate applies on stage branches.
- This file holds the project's working rules and is tracked in git. The harness guide is `.claude/CLAUDE.md`, tracked with the harness; `.claude/tmp/` and local settings stay ignored.

## Architecture rules (see `docs/architecture/`)

- Imports go **downward only**. No cycles.
  - Backend: `main.ts` → `http/` → `services/` → `db/`, `ports/` → `domain/`. `adapters/` implement `ports/`. `domain/` imports nothing.
  - Frontend: `app/` → `features/` → `api/`, `ui/`; `api/` → `packages/contract`. Features do not import each other.
  - `apps/web` never imports `apps/api`. Shared types live only in `packages/contract`.
- All database writes go through `services/reviewService`.
- **No `await` inside a database transaction.**
- Side effects (starting the AI runner) happen **only after the transaction commits**.
- Time and randomness only through `Deps` (`clock`, `random`). No `Date.now()`, `new Date()` without an argument, `Math.random()` or `setTimeout` outside `adapters/`.
- No business rules in the frontend: whether a review can be requested, the order of findings and the remaining plan come from the API.

## Commands

- `pnpm install`
- `pnpm dev` — API on port 3001 and web on port 3000
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check:deps` — dependency rules
