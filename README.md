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

To act as different lawyers at once, use separate browser profiles or a private window: the choice is stored in the browser, and other tabs pick it up only after a reload.

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

## Decisions

The three disputed points, the domain rules and the other decisions are in [docs/adr/decisions.md](docs/adr/decisions.md). In short: the previous review stays on screen, labelled, during a new run; there are no findings before completion, only progress; and there is no queue beyond the plan, with a cost confirmation before every spend.

## Assumptions

Where the brief is silent, we chose as follows. Reasons are in [the decisions](docs/adr/decisions.md), the [archived records](docs/adr/archive/README.md) and the specs.

- A review counts in the month it was requested, in the workspace's time zone (Europe/Rome), even if it finishes in the next month.
- A running review holds a plan slot, so 9 completed + 1 running rejects a new request. "Used" in the header counts only completed reviews.
- At exactly 60 seconds a review counts as overdue.
- A finding with an unknown severity, or a document the AI does not know, fails the review.
- A replaced version stays readable on the same page, marked "Read-only", with no request button.
- The "latest review" is the most recently requested one, whatever its outcome. Only the latest completed review can be read; older ones are stored but not shown.
- Current documents are listed newest first, each followed by the versions it replaced.
- Reading needs no chosen lawyer; only a request records who acted.

## Refused

Roles and permissions by job title; a queue beyond the plan; a `queued` status; findings before completion; a DI container; a job queue and a separate worker; WebSocket; the server time zone for the month boundary; event sourcing; a client generated from OpenAPI; our own styles; Docker; authentication, file upload and a real model. Reasons are in [the decisions](docs/adr/decisions.md), the [archived records](docs/adr/archive/README.md) and each spec's "Out of scope".

## Manual verification

We chose 36 core cases, the lawyer's path and the brief's rules, listed in each feature's spec: [documents-list](docs/specs/documents-list/SPEC.md), [request-review](docs/specs/request-review/SPEC.md) and [read-result](docs/specs/read-result/SPEC.md). An AI agent drove a real Chrome, and a person ran the server steps and made the decisions. Some states were prepared by writing rows directly to a test database; the review's real outcomes were also seen on real runs.

- **Verified, 34 of 36.** This includes using up the plan and a late AI event, both run on a real server: the finding and the completion that arrived after the deadline were dropped and logged, the review stayed `failed` / `timeout`, and the plan was not used.
- **Not verified by hand, 2 of 36:** what the screen shows while the API is down during a review, and a restart before the deadline. Tests cover the first. In the POC, a script covered the restart, and a person saw a review end in `timeout` after its deadline passed while the API was down.
- **Re-checked after the code-review fixes:** E5, M5, B8, C1, I7, D8 and the singular counts were run again in a browser with Claude in Chrome, and passed. That run has no session log.
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
- While the page loads, the lawyer picker briefly shows 'Who are you?' before the saved choice; there are no loading skeletons.
- The reason a button is disabled is not linked to it for screen readers (no aria-describedby).
- The documents list and the plan in the header refresh only while a review is running, on focus, or on reload; a run started elsewhere shows up there late. The document page polls every 10 s.

**By design of this solution:**

- There is no authentication: anyone who can reach the app can act as any lawyer.
- `node:sqlite` is experimental and prints `ExperimentalWarning`.
- Concurrency tests cannot show real interleaving: `node:sqlite` is synchronous on one connection.
- The runner and the sweeper live in the API's process. A restart loses a running review's AI work, and the review ends in `timeout` at its deadline.
- The first start needs internet access for the font.
- The documents list runs a few queries per document; fine at this size, a single query would be next.

## What's next

- **Survive restarts without losing work:** persist the runner's jobs, so a review cut off by a restart resumes or fails at once instead of holding its slot until the deadline.
- **A real model** behind the existing `ReviewEngine` port: a timeout per call, no retries after the first finding, cost per review.
- **Postgres:** the same rules, with a row lock on the workspace for the plan check; the partial unique index and the trigger carry over; database checks for the rules that now live in the service's SQL.
- **More than one API instance:** the runner and the sweeper must not run twice — a lease row in the database or a job queue.
- **Server-sent events** instead of polling, once many tabs are open.
- **An audit trail:** an append-only `review_events` table — who requested, each finding as it arrived, why it failed.
- **Security:** real authentication and roles instead of the header, a rate limit on review requests.
- **Deploy:** a container image, CI running tests, types, lint and the layer rules, schema migrations, a health check.
- **End-to-end tests:** the 36 manual cases as Playwright tests in CI.
- **Observability:** structured logs keyed by review id; completion, failure and timeout rates; an alert when late completions grow.

## Documentation

Start with [CODEMAP.md](CODEMAP.md): the map of the code, specs and decisions.

## AI tools

**What I used**
- **Claude (chat):** I worked through the brief and the data with it before any code — the three disputed points, the architecture, the manual test plan (the test cases themselves were then written in Claude Code). The decisions are mine; they are in [docs/adr/decisions.md](docs/adr/decisions.md). That conversation is not in the log.
- **Claude Code** (Opus as the main session, Sonnet for subagents) with my agent-stack harness (see [The harness](#the-harness)). The main session planned each stage and reviewed the results; subagents split the work: a `test-writer` that wrote failing tests from each spec's criteria, an `implementer` that wrote the code, and a code reviewer at the end. The server code carried over from the POC kept its tests, renamed to the criteria. Almost all code was written by agents; I set the rules, read the agents' reports and decided every open question.
- **Claude in Chrome:** ran the manual test cases in a real browser; I ran the server steps and decided what to do with each finding.

**Where the AI got it wrong, and what caught it**
- **A wrong test, caught by the database.** A test-writer seeded a finding into an already completed review. The database trigger rejected it; the implementer stopped and reported instead of changing the test, and the test was fixed.
- **A stale test against the spec.** An old screen test said previous findings must never show during a run, which contradicts the decision to keep the previous review readable. The implementer flagged the conflict; I decided, and the test was narrowed.
- **An agent worked around a hook.** A guard wrongly blocked an edit, and a subagent used `sed` instead. It said so in its report; later briefs tell agents not to work around a blocked edit.
- **What tests could not see.** Screen tests passed under `jsdom`, but the browser run found that a failed review read like a result and that two tabs could act as different lawyers. The first is fixed; the second is listed under Limitations.
- **What the code review found.** An error in the sweeper could stop the API, and server errors were not logged. Both were fixed test-first.

## How the AI's output was checked

- For the final solution, decisions and acceptance criteria came before code.
- Tests were written from the criteria first, by a separate agent, and their failures were checked from the agent's report before any code. Where the code was already right, tests were checked by breaking the code on purpose. The agent that writes code may not change tests; the main session changed test setup a few times and replaced tests whose spec had changed.
- Hooks block adding a skipped test or a suppressed check, on any branch. The spec gate blocks code ahead of its spec only on stage branches (`f-<feature>`); the review fixes ran on `main`, where the spec-first order was kept by hand. `pnpm check:deps` enforces the layer rules when run. The hooks watch the edit tools, not shell commands.
- I read the agent's report, with its test and trace results, after stage 4 and after stage 7, and approved those merges. Stages 5 and 6 and the late review fixes went in without my check at the time; I checked them afterwards in a browser.
- At the end, 34 of 36 core cases were run in a real browser (see Manual verification).

## The harness

`.claude/` holds a snapshot of agent-stack, my own harness for coding agents, as it was used here, with small clean-ups for publishing. It is a separate project; I set it up on this project in the POC, adapted it during this work and fed the changes back. What it does here: hooks block skipped tests and, on stage branches, code ahead of its spec; `trace` maps every acceptance criterion to its tests; subagent roles split spec review, test writing and implementation. During the work the harness ran in autonomous mode; it is published in interactive mode. If you open the repo in Claude Code, the hooks in `.claude/hooks/` are active: they need `jq`, and they block pushes and edits to the harness's hooks, scripts, settings and gates through the edit tools, and ask before installs.

## AI session log

[docs/ai-log/](docs/ai-log/) — the final solution's Claude Code sessions and subagents; its [index](docs/ai-log/README.md) gives the reading order. I worked with the agent in Russian, my native language; the log was translated into English by AI. Model reasoning, long outputs, the company's name, my surname and the POC's time records (the POC — setting up my agent harness, checking the risky parts and the first decisions — is counted separately; see Time spent) are removed. Not included: the POC session, the discussion of the final code review (the review itself is, as subagent `ac683760`), the Claude in Chrome runs, which have no session log, and the hand-in cleanup (history, documents, this log).

## Time spent

| Phase | Time |
|---|---|
| Building the solution, test cases, server checks, settings and the first README, in Claude Code | about 3 h 20 min |
| Manual verification in a real browser (32 of the 34 cases; the 2 server cases are in the row above) | about 2 h |
| Final code review and triage of its findings | about 20 min |
| Fixes after code review, and their re-check | about 35 min |

Computed from session timestamps, not a timer; gaps over 15 minutes are not counted. The browser run is from its test results' timestamps, pauses included. Not counted: preparing the hand-in (history, documents, translating this log).

Before this I built a POC to set up and test my agent harness; its decisions and part of its server code carried over.

The POC took about 3 h 50 min, mostly setting up the harness, checking the risky parts and writing the first decisions. It is not in the total above.

Over the brief's 4 hours: building the solution, the code review and fixing its findings took about 4 h 15 min; on top of that I verified 34 of 36 core cases by hand, about 6 h 15 min in all, or about 10 h with the POC.
