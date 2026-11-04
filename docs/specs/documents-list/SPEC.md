---
stage: documents-list
---

# Documents list

## Purpose

A lawyer picks who they are and sees every document in the workspace, with the state of its latest review and the plan's usage. The API computes all of it; the screen only shows it.

**Built in the POC:** only the `X-Lawyer-Id` check, on `POST /documents/:id/reviews` (AC-8). No other criterion here is built.

## Decisions

| ADR | Recorded | What it means here |
|---|---|---|
| [0003](../../adr/0003-no-queue-beyond-plan.md) | 2026-11-04 | The plan's usage is always visible |
| [0004](../../adr/0004-superseded-versions-are-read-only.md) | 2026-11-04 | A replaced version is listed under the current one |
| [0011](../../adr/0011-plan-counts-by-request-time.md) | 2026-11-04 | `GET /quota` counts by the month of the request |

## Terms

- **Workspace:** one law firm, shared by three lawyers (Partner, Senior associate, Trainee lawyer). All lawyers see the same documents.
- **Latest review:** the most recently requested review of a document.

## Backend

### Contract

Planned. These move to `packages/contract` when built, and this section then only names them.

- `GET /lawyers`
- `GET /quota` → `{ limit, used, running, remaining, month, resetsAt, timeZone }`
- `GET /documents` → list with the derived state of the latest review and the version links.
- Current lawyer: header `X-Lawyer-Id`.

### Happy path

- **AC-1:** WHEN `GET /lawyers` is called, THE SYSTEM SHALL return the three lawyers.
- **AC-2:** WHEN `GET /documents` is called, THE SYSTEM SHALL return every document, the same for every lawyer, each with the state of its latest review, who requested it and when.
- **AC-3:** WHEN a document has no reviews, THE SYSTEM SHALL give the state "not reviewed".
- **AC-4:** WHILE a review is running, THE SYSTEM SHALL give the state "in progress" with the findings so far, the deadline and `serverTime`.
- **AC-5:** WHEN the latest review completed, THE SYSTEM SHALL give the number of findings and how many are high.
- **AC-6:** WHEN `GET /quota` is called, THE SYSTEM SHALL return used, running, remaining and `resetsAt`, counted as in [request-review](../request-review/SPEC.md) (ADR-0003, ADR-0011).
- **AC-7:** THE SYSTEM SHALL mark a superseded version as replaced and link it with its current version (ADR-0004).

### Unhappy path

- **AC-8:** IF `X-Lawyer-Id` is missing, THEN THE SYSTEM SHALL answer `400` with `lawyer_required`; IF it is unknown, `400` with `lawyer_not_found`.
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
- **AC-19:** THE SYSTEM SHALL list a superseded version under its current version, marked "replaced" (ADR-0004).

### Unhappy path

- **AC-20:** WHEN the latest review failed, THE SYSTEM SHALL show the reason and, below it, the latest completed review if there is one (partner of AC-17).
- **AC-22:** IF the API does not answer, THEN THE SYSTEM SHALL show a short error message and a "Retry" button that repeats the failed call (partner of AC-14).

### Edge cases

- **AC-21:** WHEN a completed review has no findings, THE SYSTEM SHALL show "completed, no issues flagged", visibly different from "not reviewed".

## Out of scope

- Authentication, roles and permissions by job title: we only store who requested a review.
- Upload, search, filters.

## How to verify

```bash
pnpm test
```

Tests do not carry AC ids yet, so `.claude/bin/trace` cannot link them. Screen tests need a dependency that is not allowed yet, such as Testing Library; until it is approved, check the frontend by hand in a browser.

## Changes
