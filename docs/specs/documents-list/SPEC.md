---
stage: documents-list
---

# Documents list

## Purpose

A lawyer picks who they are and sees every document in the workspace, with the state of its latest review and the plan's usage. The API computes all of it; the screen only shows it.

**Built:** the backend and the screen.

## Decisions

| ADR | Recorded | What it means here |
|---|---|---|
| [0003](../../adr/0003-no-queue-beyond-plan.md) | 2026-11-04 | The plan's usage is always visible |
| [0004](../../adr/0004-superseded-versions-are-read-only.md) | 2026-11-04 | A replaced version is listed under the current one |
| [0011](../../adr/0011-plan-counts-by-request-time.md) | 2026-11-04 | `GET /quota` counts by the month of the request |
| [0015](../../adr/0015-superseded-version-uses-the-same-page.md) | 2026-11-04 | A replaced version is marked "Read-only" in the list |
| [0016](../../adr/0016-web-validates-api-responses.md) | 2026-11-04 | A response is validated before the list shows it |
| [0018](../../adr/0018-reads-need-no-lawyer-identity.md) | 2026-11-04 | Reads work before a lawyer is chosen |
| [0019](../../adr/0019-what-the-plan-numbers-mean.md) | 2026-11-04 | What used, running and remaining mean |

## Terms

- **Workspace:** one law firm, shared by three lawyers (Partner, Senior associate, Trainee lawyer). All lawyers see the same documents.
- **Latest review:** the most recently requested review of a document.

## Backend

### Contract

Exact shapes: `packages/contract`: `lawyers`, `quota`, `documents`. Routes: `getLawyers`, `getQuota`, `getDocuments`. Reads need no `X-Lawyer-Id`.

### Happy path

- **AC-1:** WHEN `GET /lawyers` is called, THE SYSTEM SHALL return the three lawyers.
- **AC-2:** WHEN `GET /documents` is called, THE SYSTEM SHALL return every document, the same for every lawyer, each with the state of its latest review, who requested it and when.
- **AC-3:** WHEN a document has no reviews, THE SYSTEM SHALL give the state "not reviewed".
- **AC-4:** WHILE a review is running, THE SYSTEM SHALL give the state "in progress" with the findings so far, the deadline and `serverTime`.
- **AC-5:** WHEN the latest review completed, THE SYSTEM SHALL give the number of findings and how many are high.
- **AC-6:** WHEN `GET /quota` is called, THE SYSTEM SHALL return used (completed this month), running (not overdue), remaining (limit − used − running) and `resetsAt`, counted as in [request-review](../request-review/SPEC.md) (ADR-0003, ADR-0011, ADR-0019).
- **AC-7:** THE SYSTEM SHALL mark a superseded version with its current version, and list it directly after that version (ADR-0004).

### Unhappy path

- **AC-8:** WHEN a request records who acted, IF `X-Lawyer-Id` is missing, THEN THE SYSTEM SHALL answer `400` with `lawyer_required`; IF it is unknown, `400` with `lawyer_not_found` (ADR-0018).
- **AC-9:** WHEN the latest review failed, THE SYSTEM SHALL give the reason and, separately, the latest completed review if there is one (partner of AC-5).
- **AC-10:** IF a running review is past its deadline, THEN THE SYSTEM SHALL give it as failed with `timeout`, even before the sweeper persists it (partner of AC-4).

### Edge cases

- **AC-11:** WHEN a completed review has no findings, THE SYSTEM SHALL give a state distinct from "not reviewed". In the samples this is the Delta Advisory consulting agreement.
- **AC-12:** WHEN the samples are seeded, THE SYSTEM SHALL hold 3 lawyers and 13 documents, of which 12 are current versions.

## Frontend

### Happy path

- **AC-13:** WHEN a lawyer picks themselves in the header, THE SYSTEM SHALL show their name, remember the choice in the browser and send it as `X-Lawyer-Id` with every request.
- **AC-14:** THE SYSTEM SHALL list every document, with who requested its latest review and when.
- **AC-15:** WHEN the state is "not reviewed", THE SYSTEM SHALL show "not reviewed".
- **AC-16:** WHILE a review is running, THE SYSTEM SHALL show "in progress" with N findings so far and X s of 60, with elapsed time from `serverTime`.
- **AC-17:** WHEN the latest review completed, THE SYSTEM SHALL show N findings, of which high.
- **AC-18:** THE SYSTEM SHALL always show the plan's usage in the header: "Used 4 of 10 · 1 running · resets on 1 December" (ADR-0003).
- **AC-19:** THE SYSTEM SHALL list a superseded version under its current version, marked "Read-only" (ADR-0004, ADR-0015).

### Unhappy path

- **AC-20:** WHEN the latest review failed, THE SYSTEM SHALL show the reason and, below it, the latest completed review if there is one, labelled "Earlier result:" (partner of AC-17).
- **AC-22:** IF the API does not answer, or its response fails validation, THEN THE SYSTEM SHALL show a short error message and a "Retry" button that repeats the failed call (partner of AC-14; ADR-0016).

### Edge cases

- **AC-21:** WHEN a completed review has no findings, THE SYSTEM SHALL show "completed, no issues flagged", visibly different from "not reviewed".
- **AC-23:** THE SYSTEM SHALL use the singular for a count of one: "1 finding", "1 finding so far".
- **AC-24:** THE SYSTEM SHALL show dates in the workspace's time zone, from `GET /quota`. IF the plan cannot be read, THEN it SHALL show the same error and "Retry" as AC-22.

## To check in manual testing

Decisions the source documents did not settle. Each is built as written, and can change after the human tries it.

- **Reads need no `X-Lawyer-Id`** (ADR-0018). Only the `POST` that records who acted requires it.
- **The header for 9 completed + 1 running** reads "Used 9 of 10 · 1 running" (ADR-0019).
- **List order:** current versions by upload date, newest first, ties by id. Each replaced version sits directly under the version that replaced it. The source documents give no order for current versions.
- **The label** on a replaced version is "Read-only". The human said "something like read-only, or nothing" (ADR-0015).
- **Latest review** means the most recently requested one, whatever its outcome.
- **A response that fails validation** looks the same as an API that does not answer (ADR-0016).
- **Texts the source documents do not give:** "Review timed out", "Review failed: AI error", "N findings, M high".
- **If one refresh fails while polling,** the list is replaced by the error and "Retry".
- **No automatic retries:** a failed call shows the error at once.

## Out of scope

- Authentication, roles and permissions by job title: we only store who requested a review.
- Upload, search, filters.

## How to verify

```bash
pnpm test
```

Tests carry AC ids: `.claude/bin/trace <feature>` lists what is not covered. Screen tests run under Vitest with Testing Library and `jsdom` (ADR-0017), which is not a real browser, so check the frontend by hand too.

## Changes

- 2026-11-05 — AC-20: an older result under a failure is labelled "Earlier result:". Added AC-23 (singular counts) and AC-24 (dates in the workspace's time zone).
- 2026-11-04 — No criterion changed: the screen is built.
- 2026-11-04 — Added "To check in manual testing": decisions the source documents did not settle.
- 2026-11-04 — AC-8: applies only where a request records who acted, because reads carry no identity and `GET /lawyers` comes before a lawyer is chosen. AC-6: defines used, running and remaining. AC-7: states the order.
- 2026-11-04 — AC-19: "replaced" becomes "Read-only" — ADR 0015.
- 2026-11-04 — AC-22: also covers a response that fails validation — ADR 0016.
