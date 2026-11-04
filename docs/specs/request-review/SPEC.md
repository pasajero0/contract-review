---
stage: request-review
---

# Request and follow a review

## Purpose

A lawyer requests an AI review of a document, knowing what it costs, and follows it until it completes or fails. The API ends each review exactly once, under the plan and the 60-second rule.

**Built in the POC:** the backend except AC-7 (`canRequest` and `GET /documents/:id`). In the frontend, only a button that sends the `POST` through the Next.js rewrite and shows the JSON answer, checked with a real click.

## Decisions

| ADR | Recorded | What it means here |
|---|---|---|
| [0001](../../adr/0001-previous-review-stays-visible.md) | 2026-11-04 | The previous review stays on screen, labelled, during a run |
| [0002](../../adr/0002-findings-only-after-completion.md) | 2026-11-04 | A running review shows a count, never content |
| [0003](../../adr/0003-no-queue-beyond-plan.md) | 2026-11-04 | Beyond the plan the request is rejected; a confirmation states the cost |
| [0004](../../adr/0004-superseded-versions-are-read-only.md) | 2026-11-04 | A superseded version cannot be reviewed |
| [0005](../../adr/0005-typescript-end-to-end.md) | 2026-11-04 | `node:sqlite` cannot show real concurrency problems |
| [0006](../../adr/0006-modular-monolith-no-job-queue.md) | 2026-11-04 | The runner and sweeper live in one process; a restart ends in `timeout` |
| [0007](../../adr/0007-polling-for-progress.md) | 2026-11-04 | The screen polls every 1–2 s during a run |
| [0008](../../adr/0008-guarantees-live-in-the-database.md) | 2026-11-04 | The index, triggers and conditional updates enforce the rules |
| [0009](../../adr/0009-utc-storage-workspace-time-zone.md) | 2026-11-04 | The month is computed in the workspace time zone |
| [0011](../../adr/0011-plan-counts-by-request-time.md) | 2026-11-04 | A review counts in the month of its request, and a running one holds a slot |
| [0012](../../adr/0012-unknown-severity-fails-review.md) | 2026-11-04 | An unknown severity fails the review |

## Terms

- **Plan:** 10 successful reviews per calendar month for the whole workspace.
- **Deadline:** `requested_at` + 60 s, stored in the row. At exactly the deadline a review counts as overdue.
- **Late event:** a finding, completion or failure that arrives at or after the deadline.
- **Fake AI:** returns a document's findings from `samples/documents.json` one at a time, in JSON order. About 1 in 5 fails with an error after k findings (k from 0 to n); about 1 in 10 is slow, 60–120 s in total; otherwise 5–30 s in total. Delays go through `clock`, the scenario through `random`.

## Model and state transitions

| State | Event | New state | Criterion |
| --- | --- | --- | --- |
| (none) | Request accepted | `running` | AC-1 |
| `running` | AI finished before the deadline | `completed` | AC-3 |
| `running` | AI error or unknown severity | `failed` / `ai_error` | AC-11, AC-12 |
| `running` | Deadline passed | `failed` / `timeout` | AC-13 |
| `completed`, `failed` | Any event | No change, logged | AC-14 |

## Backend

### Contract

Built routes are in `packages/contract`. Rejections on `POST /documents/:id/reviews`: `409` with `review_in_progress` (who, when), `plan_exhausted` (`resetsAt`) or `document_superseded` (id of the current version); `404` with `document_not_found`. `GET /reviews/:id` gives `404` with `review_not_found`.

Planned: `GET /documents/:id` → `current` (running review: who, when, deadline, findings so far, no content), `lastFailed` (reason, findings that had arrived), `canRequest` (whether, why not, how many will remain). `latestCompleted` is in [read-result](../read-result/SPEC.md).

### Happy path

- **AC-1:** WHEN a request is accepted, THE SYSTEM SHALL, in one transaction with no `await` inside, expire overdue reviews, check the version, the running review and the plan, and create a `running` review with a deadline of +60 s; it SHALL answer `201` without waiting for the AI (ADR-0008, ADR-0011).
- **AC-2:** THE SYSTEM SHALL start the AI only after that transaction commits.
- **AC-3:** WHEN the AI finishes before the deadline, THE SYSTEM SHALL mark the review `completed` and consume the plan slot.
- **AC-4:** WHILE a review runs, `GET /reviews/:id` SHALL return status, findings count, `requestedAt`, `deadlineAt` and `serverTime`, with no finding content (ADR-0002).
- **AC-5:** WHEN a lawyer retries, THE SYSTEM SHALL create a new review; the old one stays `failed`.
- **AC-6:** WHEN a document has no findings, THE SYSTEM SHALL complete its review with 0 findings.
- **AC-7:** WHEN `GET /documents/:id` is called, THE SYSTEM SHALL return `canRequest` with whether a review can be requested, why not, and how many will remain, so the screen decides nothing.

### Unhappy path

- **AC-8:** IF a review is running on the document, THEN THE SYSTEM SHALL reject with `review_in_progress`, who started it and when (partner of AC-1; ADR-0008).
- **AC-9:** IF the plan is used up, including 9 completed + 1 running, THEN THE SYSTEM SHALL reject with `plan_exhausted` and `resetsAt`. There is no queue (partner of AC-1; ADR-0003, ADR-0011).
- **AC-10:** IF the document is superseded, THEN THE SYSTEM SHALL reject with `document_superseded` and the current version's id; IF it is unknown, `404` with `document_not_found` (partner of AC-1; ADR-0004).
- **AC-11:** IF the AI fails, THEN THE SYSTEM SHALL mark the review `failed` / `ai_error`, leave the plan unused and free the document (partner of AC-3).
- **AC-12:** IF a finding has an unknown severity, THEN THE SYSTEM SHALL fail the review with `ai_error` (partner of AC-3; ADR-0012).
- **AC-13:** IF a review is still running at 60 s, even with nothing sent by the AI, THEN THE SYSTEM SHALL give it as `failed` / `timeout` on read, and the sweeper SHALL persist it with `finished_at = deadline_at`, freeing the document and the slot (partner of AC-3).
- **AC-14:** IF a finding, completion or failure arrives late, THEN THE SYSTEM SHALL drop it and log it ("completion arrived 4s after deadline, dropped"); the review never becomes completed and the plan is not used (ADR-0008).

### Edge cases

- **AC-15:** WHEN two requests arrive at the same time for one document, THE SYSTEM SHALL accept one (`201`) and reject the other (`409`, `review_in_progress`).
- **AC-16:** WHEN two requests compete for the last slot, THE SYSTEM SHALL accept exactly one (ADR-0011).
- **AC-17:** IF a `running` review is overdue, THEN THE SYSTEM SHALL NOT let it block a new request.
- **AC-18:** THE SYSTEM SHALL not count failed reviews against the plan.
- **AC-19:** THE SYSTEM SHALL count a review in the month of its request, in the workspace time zone: one requested on the 31st and finished on the 1st counts for the 31st, and earlier months fall out of the count. The Rome and Sofia boundaries differ by one hour (ADR-0009, ADR-0011).
- **AC-20:** IF the server restarts during a review, THEN THE SYSTEM SHALL fail that review with `timeout` at its deadline and free the document and the slot (ADR-0006).
- **AC-21:** IF anything tries to change a finished review or the facts of any review, update or delete a finding, add a finding to a finished review, or delete a review, THEN THE DATABASE SHALL reject it (ADR-0008).

## Frontend

Whether a review can be requested and how many remain come from `canRequest`; the screen computes neither.

### Happy path

- **AC-22:** WHEN a lawyer clicks "Request review", THE SYSTEM SHALL ask for confirmation: "This uses 1 of your 6 remaining reviews — only if it completes." (ADR-0003).
- **AC-23:** WHEN one slot remains, THE SYSTEM SHALL say "This is the last review available this month." (ADR-0003).
- **AC-24:** WHEN the lawyer confirms, THE SYSTEM SHALL send the request and start following the review.
- **AC-25:** WHILE a review runs, THE SYSTEM SHALL show every lawyer, polling every 1–2 s, "In progress · requested by X · 3 findings so far · 20 s of 60", with no finding content and elapsed time from `serverTime` (ADR-0002, ADR-0007).
- **AC-26:** WHILE a review runs and an earlier one completed, THE SYSTEM SHALL show the earlier one as a separate block, "Previous review · date · requested by", with a banner that a new review is running (ADR-0001).
- **AC-27:** WHEN a review completes, THE SYSTEM SHALL stop polling and remove the "Previous review" block; the new review is now the latest.

### Unhappy path

- **AC-28:** WHEN `canRequest` says a review is running, THE SYSTEM SHALL disable the button and show "A review is already running — started by Riccardo Fanti at 14:02."
- **AC-29:** WHEN `canRequest` says the plan is used up, THE SYSTEM SHALL disable the button and show "10 of 10 used. Resets on 1 December." (ADR-0003).
- **AC-30:** IF the server rejects a request anyway, THEN THE SYSTEM SHALL show the same reason as AC-28, AC-29 or AC-31, and create nothing on screen (partner of AC-24).
- **AC-31:** WHEN the document is superseded, THE SYSTEM SHALL offer no request. Whether the button is absent or disabled is open in ADR-0004.
- **AC-32:** WHEN a review fails with `ai_error`, THE SYSTEM SHALL show "Review did not complete: AI error after 3 findings. There is no result.", a "Retry" button, and any previous completed review with its label (partner of AC-27).
- **AC-33:** WHEN a review fails with `timeout`, THE SYSTEM SHALL show "Review did not complete within 60 seconds. There is no result." and a "Retry" button (partner of AC-27).
- **AC-35:** IF the API does not answer, THEN THE SYSTEM SHALL show a short error message and a "Retry" button that repeats the failed call. It SHALL NOT show a running review as failed because of this. Repeating a request is safe: the server rejects a second review with `review_in_progress` (partner of AC-24, AC-25).

### Edge cases

- **AC-34:** WHEN a lawyer clicks "Retry", THE SYSTEM SHALL ask for confirmation again, as for a new request.

## Non-functional requirements

- A review fails at 60 s. The sweeper runs every 5 s, so a timeout is persisted within 5 s of the deadline.
- The screen polls every 1–2 s, only while a review runs.
- Tests that depend on time use `ManualClock`, with no real waiting.

## Out of scope

- A queue or a `queued` status (ADR-0003).
- Findings before completion (ADR-0002).
- Real concurrency at database level: `node:sqlite` is synchronous on one connection (ADR-0005).

## How to verify

```bash
pnpm test
```

Tests do not carry AC ids yet, so `.claude/bin/trace` cannot link them. Restart (AC-20) by hand: start a review, stop the API, start it again, and after 60 s the review is `failed` / `timeout`. Screen tests need a dependency that is not allowed yet, such as Testing Library; until it is approved, check the frontend by hand in a browser.

## Changes
