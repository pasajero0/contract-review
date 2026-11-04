# Contract review POC — working rules

Read these first, in this order:
1. `CODEMAP.md` — where everything lives.
2. `docs/poc/plan.md` — what to build in this POC, stage by stage.
3. `docs/adr/` — why: architecture, domain rules, product decisions.
4. `docs/specs/` — how each feature behaves, backend and frontend.
5. `docs/architecture/` — how the code is organised.

This is a throwaway spike. Its goal is to remove technical risk, not to build the solution.

## How we work

- Work **one stage at a time** from `docs/poc/plan.md`. Stop when the stage's done criteria pass.
- **Keep reports short:** a TLDR in bullets, "Done: ..." then "Questions: ...". The human asks to expand anything unclear.
- At the end of each stage, the report also names the commands run with their result, and **"Decisions not in plan"**: anything decided that the docs do not cover.
- Commits: one stage = one commit, with generated shadcn components in their own commit (`docs/adr/0013-tooling-choices.md`). This is a POC, so the agent may commit a finished stage. Never push.
- Commit description: bullets saying what was done and, where useful, why.
- Diary: `.claude/tmp/poc-diary.md`, written during each stage: what was done, difficulties and mistakes, decisions not in the plan, what may not work.
- Stages 2, 4 and 5: **tests first.** Write the tests from the stage's done criteria, stop, wait for review, then implement.
- **Never change a test to make it pass.** If a test looks wrong, stop and explain why.
- Dependencies: only the ones allowed in `docs/poc/plan.md` §3, at exact versions. Ask before adding anything else.
- No Docker.
- English everywhere in the repository: code, comments, commit messages, docs.
- If the docs are unclear or contradict each other, stop and ask. Do not guess. Known open points are in `docs/poc/plan.md` §8.

## Documentation

All documents live in `docs/`; only `README.md`, `CLAUDE.md` and `CODEMAP.md` sit in the root. Each fact lives in one place. What the code already says is not repeated in docs.

- **ADR (`docs/adr/`):** why a decision was made. A dated ledger, not edited: a new decision replaces an old one with a new entry, marked `Supersedes`. It lists its features under "Applies to".
- **Spec (`docs/specs/<feature>/SPEC.md`):** one feature, edited in place; the code changes after the spec. One file: purpose, Decisions table (ADR, date, what it means here), Backend, Frontend. A status code goes under Backend, a text on screen under Frontend. A criterion that follows from a decision cites it (`ADR-0003`). Folders are named after the feature, not numbered: a number reads like a version. Do not split a spec into several files: `spec-gate` and `trace` read only `SPEC.md`.
- **Only for real behaviour.** No spec for mechanical work such as the scaffold: its facts live in the code and configs. A 29-criterion scaffold spec and its review were written and thrown away; the plan's 4 done criteria were enough.
- **Contract (`packages/contract`):** the only place for API shapes. Once a shape is built, a spec only names it.
- **`docs/architecture/`:** how the code is organised: overview, backend, frontend. **`CODEMAP.md`:** the map; link every new spec from it. **`docs/poc/`:** the POC archive.
- No other Markdown files. Details: `.claude/rules/docs-layout.md`.
- `specGate` is `stage`: code is open on `main`, and the gate applies on stage branches.
- This file holds the project's working rules and is tracked in git. The harness guide is `.claude/CLAUDE.md`, ignored with the rest of `.claude/`.

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
