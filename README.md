# Contract review POC

A throwaway spike for a contract review flow in a law firm's workspace, shared by three lawyers. The AI is fake. Its goal is to remove technical risks before the real solution: its findings, not its code, go forward.

**What it is not:** there are no screens from the specs. The web app has one button for one document and one lawyer. Most scenarios are checked through the API and tests.

## Run

Needs Node 22.21.1 (`.nvmrc`) and pnpm 10.24.0. There is no Docker.

```bash
pnpm install
pnpm dev        # API on 3001, web on 3000
```

Open http://localhost:3000 and click "Request review": the page shows the JSON answer. `next dev` fetches the Geist font from Google, so it needs network.

Data is kept in `apps/api/lex-poc.db`, or in `LEX_DB_PATH`. To start clean, stop `pnpm dev` and delete the file.

## Test

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm check:deps
```

## Check scenarios by hand

```bash
API=http://127.0.0.1:3001
LAWYER=7c1f3d2a-9b64-4e0f-8a21-5d3e6f7a8b90
OLD=125c8706-e702-4d6f-b2c5-80aeb110cd5c    # replaced by a newer version
FREE=eb07c3a3-6967-4de6-bd82-3930f49ecf5c

curl -i -X POST $API/documents/$FREE/reviews -H "x-lawyer-id: $LAWYER"
curl $API/reviews/<reviewId>
```

| Scenario | How | Expected |
|---|---|---|
| Request | `POST` on `$FREE` | `201` with `reviewId` |
| Already running | Repeat the `POST` at once | `409` `review_in_progress` |
| Superseded version | `POST` on `$OLD` | `409` `document_superseded` |
| Follow | Repeat the `GET` | `running`, then `completed` or `failed` |
| Restart | Start a review, stop and start `pnpm dev`, wait 60 s | `failed`, `timeout` |

The outcome is random: about 70% complete, 20% fail with `ai_error`, 10% time out. It cannot be chosen from outside.

Month boundaries are checked only by tests.

## Decisions on the three disputed points

The partner's requirements are about trust in a legal result, so they win over convenience. Where both can be met with clear labelling, we meet both.

| Point | Decision | ADR |
|---|---|---|
| Previous review while a new one runs | Shown in full, as a separate block labelled "Previous review" | [0001](docs/adr/0001-previous-review-stays-visible.md), [0021](docs/adr/0021-previous-review-stays-readable-in-full.md) |
| Findings before the review finishes | Progress only; we refuse the product manager's request | [0002](docs/adr/0002-findings-only-after-completion.md) |
| Requests beyond the plan | Rejected, no queue; we refuse the product manager's request | [0003](docs/adr/0003-no-queue-beyond-plan.md) |

The POC does not build these on screen: it builds their server side only.

## Refused

Roles and permissions by job title; a queue beyond the plan; a `queued` status; findings before completion; a DI container; a job queue and a separate worker; WebSocket; the server time zone for the month boundary; event sourcing; a client generated from OpenAPI; our own styles; Docker; authentication, file upload and a real model. Reasons are in the [ADRs](docs/adr/README.md).

## Limitations

- See [what the POC did not prove](docs/poc/conclusions.md#not-proved-by-the-poc).
- `node:sqlite` is experimental and prints `ExperimentalWarning`.
- Concurrency tests cannot show real interleaving: `node:sqlite` is synchronous on one connection.

## Documentation

Start with [CODEMAP.md](CODEMAP.md): the map of the code, specs and decisions.

## AI tools

Claude Code with the agent-stack harness. A main session planned and reviewed; subagents reviewed specs and code, and, for the review fixes, wrote tests and code. Stages 2–6 were written by the main session, against the harness's routing table.
