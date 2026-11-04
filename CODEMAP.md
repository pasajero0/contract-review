# CODEMAP

Where things live. Start here.

## Code

| Path | What |
|---|---|
| `apps/api/` | Backend: rules, database, fake AI. Entry: `src/main.ts`; tables: `src/db/schema.sql` |
| `apps/web/` | Next.js frontend. Entry: `src/app/page.tsx` |
| `packages/contract/` | The API's shapes, shared by both apps |
| `samples/` | Lawyers, documents, and the findings the fake AI returns |
| `.dependency-cruiser.cjs` | Import rules, checked by `pnpm check:deps` |

## Documents

All documents live in `docs/`. Only `README.md`, `CLAUDE.md` and this file sit in the root.

| Path | What |
|---|---|
| [docs/architecture/](docs/architecture/overview.md) | How the code is organised: [overview](docs/architecture/overview.md), [backend](docs/architecture/backend.md), [frontend](docs/architecture/frontend.md) |
| [docs/adr/](docs/adr/README.md) | Why: one file per decision, plus a map of old ids |
| [docs/poc/](docs/poc/conclusions.md) | POC archive: [plan and results](docs/poc/plan.md), [conclusions](docs/poc/conclusions.md) |
| [README.md](README.md) | Run, test, the three decisions, limitations, AI tools, time |
| [CLAUDE.md](CLAUDE.md) | Working rules, including where each document goes |
| `.claude/` | The agent-stack harness, ignored by git |

## Features

One folder per feature, in `docs/specs/`. Each `SPEC.md` holds the purpose, the decisions behind it, then Backend and Frontend.

| Feature | Spec |
|---|---|
| See documents and their state | [documents-list](docs/specs/documents-list/SPEC.md) |
| Request and follow a review | [request-review](docs/specs/request-review/SPEC.md) |
| Read a completed review | [read-result](docs/specs/read-result/SPEC.md) |
