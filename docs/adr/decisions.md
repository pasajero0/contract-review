# Decisions

**Status:** Accepted

This file replaces the separate decision records. The originals, with their alternatives in full and their final status, are in [docs/adr/archive/](archive/README.md); their text is as written, so links may point to the old layout. Specs cite them by number (`ADR-0003`).

## The three disputed points

The partner's requirements are about trust in a legal result, so they win over convenience. Where both sides can be met with clear labelling, we meet both.

**The previous review stays on screen, labelled, during a new run.** While a review runs, the last completed one stays readable in full as a separate block, "Previous review · date · requested by", under a banner that a new review is running. After a failure it is muted and labelled "Earlier result". Why: the lawyer never waits in front of nothing, and the label keeps an old result from reading as the new one. We refused both to hide it during a run and to show it in the normal result block.

**No findings before completion, only progress.** A running review shows a count and the seconds elapsed: "In progress · requested by X · 7 findings so far · 23 s of 60". After a failure the screen says "There is no result". Why: a review can still fail, and a partial list can read as final; a franchise review that failed at its 12th of 18 findings would look complete. We refused the product manager's request to show each finding as it arrives, even inside an "incomplete" frame, which is easy to skim past.

**No queue beyond the plan.** A request beyond the plan is rejected, and the button is disabled with the reason and the reset date. The plan's usage is always on screen, and a confirmation states the cost before every spend. Why: nobody should spend one of ten reviews without knowing, or believe a review is coming when it would start weeks later. We refused the product manager's request to take extra requests and run them at the reset, which would silently spend next month's plan.

## Domain rules

- **60 seconds.** A review has 60 seconds from its request; exactly at the deadline it is overdue. It reads as `failed` / `timeout` from then on, and the sweeper persists that within 5 seconds. A finding, completion or failure that arrives late is dropped and logged, and it never completes the review or uses the plan.
- **One running review per document.** A partial unique index on `reviews(document_id)` where `status = 'running'` enforces it. A second request gets `review_in_progress`, with who started the first and when. An overdue review blocks nothing.
- **The plan count.** Completed and running reviews hold a slot; failed ones do not count. So 9 completed and 1 running reject a request with `plan_exhausted`. The count is read from the reviews, never stored, and the check and the insert run in one transaction.
- **Month in the workspace time zone.** A review counts in the month of its request, in the workspace's zone, `Europe/Rome`, not the server's. Timestamps are stored as UTC milliseconds, and month boundaries are computed with `Intl`.
- **A superseded version is read-only.** It uses the same page with no request button, is marked "Read-only", and links to the newest version. Its past reviews stay readable, marked as reviews of an outdated version. A request on it is rejected with `document_superseded`.
- **A document unknown to the AI fails the review.** It ends as `failed` / `ai_error`, because treating it as having no findings would read as "no issues". A known document with no findings completes normally.

## Other decisions

| Decision | Why |
|---|---|
| TypeScript end to end, with SQLite | The language the author knows best, for a solution changed live; one command to start, with no database to run |
| Modular monolith; runner and sweeper in the API process | No queue or worker to run. An interrupted review expires through the deadline in its row |
| Polling instead of WebSocket | One-way data that changes a few times: every 1–2 s during a run, every 10 s on an idle document page |
| Guarantees in the database: index, trigger, conditional updates | A bug in the code cannot start a second run or change a finished review. Exception: finished reviews are frozen by a trigger; inserting a review as finished and finishing after the deadline are prevented by the service's conditional SQL, not by the database. The test seed helpers write finished reviews directly, so a database rule would block them |
| Shared Zod contract | One place for API shapes: the API builds with it, and the web app validates every response with it |
| Layers checked by dependency-cruiser | Imports go downward only, and `pnpm check:deps` fails otherwise |
| `Deps` object instead of a DI container | A typed object built in `main.ts` is enough to replace the clock, randomness and the engine in tests |
| shadcn/ui | Proven components copied into the repo, so screens stay minimal, with no styles of our own |
| No Docker | One command to start: SQLite comes with Node |
| No auth | The flow needs only who requested a review, and a header records it. Real authentication is a next step |
