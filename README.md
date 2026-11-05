# Contract review

A contract review flow for a law firm's workspace, shared by three lawyers. A lawyer sees the workspace's documents, requests an AI review of one, follows it until it completes or fails, and reads the result. The AI is fake, and there is no authentication: you choose who you are in the header.

## Run

### What you need

- Node 22.21.1 (see `.nvmrc`; with nvm, run `nvm use`)
- pnpm 10.24.0 (the version is pinned in `package.json`; `corepack enable` provides it)
- Internet access on first start: `next dev` downloads the Geist font from Google

There is no Docker, and no database to install: SQLite comes with Node.

### Start

```bash
pnpm install
pnpm dev
```

This starts both apps:

| App | Address |
|---|---|
| Web | http://localhost:3000 |
| API | http://127.0.0.1:3001 |

Both listen on this computer only. On first start the API creates the database and loads 3 lawyers and 13 documents from `samples/`. The warning `ExperimentalWarning: SQLite is an experimental feature` is expected.

### Use the app

1. Open http://localhost:3000. You see 13 documents and the plan's usage in the header.
2. Choose a lawyer in "Who are you?". Reading needs no choice; requesting a review does.
3. Open a document and click "Request review". A dialog states the cost; click "Confirm".
4. Follow the progress line. A review ends within 60 seconds.
5. Read the result, or click "Retry" if the review failed.

To act as different lawyers at once, use separate browser profiles or a private window: the choice is stored in the browser and shared by its tabs.

### What to expect from the fake AI

The outcome is random and cannot be chosen from outside: about 70% complete in 5–30 s, 20% fail with an AI error, and 10% are slow and time out at 60 s. A failed review does not use the plan, so try again.

### Settings

Everything works with no settings. To change them, copy the example, which holds the current values:

```bash
cp .env.example .env
```

| Variable | Default | What it does |
|---|---|---|
| `API_HOST` | `127.0.0.1` | Address the API listens on |
| `API_PORT` | `3001` | Port the API listens on |
| `API_URL` | `http://127.0.0.1:3001` | Where the web app finds the API; change it together with `API_PORT` |
| `LEX_DB_PATH` | `apps/api/lex-poc.db` | The SQLite file; a relative path starts from `apps/api` |

Restart `pnpm dev` after a change. None of these is a secret. The web app's port is set in `apps/web/package.json`. The plan's limit, the 60-second rule and the time zone are business rules, so they live in `apps/api/src/domain/config.ts`.

### Start clean

Stop `pnpm dev`, then delete the database:

```bash
rm -f apps/api/lex-poc.db apps/api/lex-poc.db-wal apps/api/lex-poc.db-shm
```

The next start creates it again. This is also how to get the plan back after using all 10 reviews. Reviews cannot be deleted one by one: the database forbids it.

### If something goes wrong

| What you see | What to do |
|---|---|
| `EADDRINUSE` on port 3000 or 3001 | Something already uses the port, often an earlier `pnpm dev`. Find it with `lsof -nP -iTCP:3000 -iTCP:3001 -sTCP:LISTEN` and stop it |
| `next dev` fails while fetching the font | Connect to the internet and start again |
| "Could not load the documents." | The API is not running. Check the `pnpm dev` output, then click "Retry" |
| Every "Request review" button is disabled, with "10 of 10 used" | The plan is used up. Start clean |

## Test

No server is needed.

```bash
pnpm test         # unit, API and screen tests
pnpm typecheck    # TypeScript in all packages
pnpm lint         # ESLint
pnpm check:deps   # import rules between layers
```

Time-dependent tests use a manual clock, so they do not wait. Screen tests run under `jsdom`, not in a real browser.

## Check scenarios by hand

With `pnpm dev` running, in a second terminal:

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

Month boundaries are checked only by tests.

## Decisions on the three disputed points

The partner's requirements are about trust in a legal result, so they win over convenience. Where both can be met with clear labelling, we meet both.

| Point | Decision | Why | ADR |
|---|---|---|---|
| Previous review while a new one runs | Shown in full, as a separate block labelled "Previous review", under a banner that a new review is running | Nobody waits in front of nothing, and the label keeps an old result from reading as the new one. Both sides get what they asked for | [0001](docs/adr/archive/0001-previous-review-stays-visible.md), [0021](docs/adr/archive/0021-previous-review-stays-readable-in-full.md) |
| Findings before the review finishes | Progress only: a count and the seconds elapsed. We refuse the product manager's request | A review can still fail, and a partial list can read as final. After a failure the screen says "There is no result." | [0002](docs/adr/archive/0002-findings-only-after-completion.md) |
| Requests beyond the plan | Rejected, with no queue and the reset date on screen. We refuse the product manager's request. A confirmation states the cost before each request | Nobody should believe a review is on its way when it will not start for weeks, or spend one of the ten without knowing | [0003](docs/adr/archive/0003-no-queue-beyond-plan.md) |

## Assumptions

Where the brief is silent, we chose as follows. Reasons are in [the decisions](docs/adr/decisions.md).

- A review counts in the month it was requested, in the workspace's time zone (Europe/Rome), even if it finishes in the next month.
- A running review holds a plan slot, so 9 completed + 1 running rejects a new request. "Used" in the header counts only completed reviews.
- At exactly 60 seconds a review counts as overdue.
- A finding with an unknown severity, or a document the AI does not know, fails the review.
- A replaced version stays readable on the same page, marked "Read-only", with no request button.
- The "latest review" is the most recently requested one, whatever its outcome. Only the latest completed review can be read; older ones are stored but not shown.
- Current documents are listed newest first, each followed by the versions it replaced.
- Reading needs no chosen lawyer; only a request records who acted.

## Refused

Roles and permissions by job title; a queue beyond the plan; a `queued` status; findings before completion; a DI container; a job queue and a separate worker; WebSocket; the server time zone for the month boundary; event sourcing; a client generated from OpenAPI; our own styles; Docker; authentication, file upload and a real model. Reasons are in [the decisions](docs/adr/decisions.md).

## Manual verification

We chose 36 core cases: the lawyer's path and the brief's rules. An AI agent drove a real Chrome, and a person ran the server steps and made the decisions. Some states were prepared by writing rows directly to a test database; the review's real outcomes were also seen on real runs.

- **Verified, 34 of 36.** This includes using up the plan, and a late AI event on a real server: the finding and the completion that arrived after the deadline were dropped and logged, the review stayed `failed` / `timeout`, and the plan was not used.
- **Not verified by hand, 2 of 36:** what the screen shows while the API is down during a review, and a restart before the deadline. Tests cover the first. In the POC, a script covered the restart, and a person saw a review end in `timeout` after its deadline passed while the API was down.
- **Not finished:** a wider list of less critical cases, including the database's write protections and month boundaries by hand. Automated tests cover both.

## Limitations

**Found in manual testing and not fixed:**

- An open confirmation can show a number of remaining reviews up to 10 seconds old. The server still rejects the request, and the screen shows why.
- The chosen lawyer is not synchronised between tabs. A tab can show one lawyer while its request is recorded under the one chosen in another tab.
- A chosen lawyer who no longer exists gives a generic "Could not send the request." with a "Retry" that cannot help.
- An unknown document's address offers a "Retry" that cannot help.
- Two versions of a document have the same title in the list; only "Read-only" tells them apart.
- With 9 completed + 1 running, the disabled button says "10 of 10 used", which is not literally true.
- If the plan cannot be refreshed, the document page keeps its last data with a notice, and the header shows the error.

**By design of this solution:**

- There is no authentication: anyone who can reach the app can act as any lawyer.
- `node:sqlite` is experimental and prints `ExperimentalWarning`.
- Concurrency tests cannot show real interleaving: `node:sqlite` is synchronous on one connection.
- The runner and the sweeper live in the API's process. A restart loses a running review's AI work, and the review ends in `timeout` at its deadline.
- The first start needs internet access for the font.
- The archived decision records in `docs/adr/archive/` keep their text as written, with only their final status added, so their links to other folders no longer resolve.

## Documentation

Start with [CODEMAP.md](CODEMAP.md): the map of the code, specs and decisions.

## AI tools

- **Claude Code with the agent-stack harness:** specs, ADRs, tests and code. Its hooks block skipped tests, imports across layers, and code that runs ahead of its spec.
- **POC:** a main session planned and reviewed; subagents reviewed specs and code, and wrote the tests and code for the review fixes. Stages 2–6 were written by the main session, against the harness's routing table.
- **Final solution:** a main session planned and reviewed. A `test-writer` subagent wrote failing tests from each spec's criteria, then an `implementer` subagent wrote the code.
- **Claude in Chrome:** drove the manual test cases in a real browser. A person ran the server steps and decided what to do with each finding.
