---
stage: read-result
---

# Read a completed review

## Purpose

A lawyer reads the result of a completed review: the clauses the AI flagged, each with its severity and explanation. The API sorts the findings and never returns their content for a review that did not complete.

**Built:** the backend and the screen. The screen is not yet checked by hand.

## Decisions

| ADR | Recorded | What it means here |
|---|---|---|
| [0002](../../adr/0002-findings-only-after-completion.md) | 2026-11-04 | Content is shown only for a `completed` review |
| [0004](../../adr/0004-superseded-versions-are-read-only.md) | 2026-11-04 | Reviews of a replaced version stay readable, with a banner |
| [0015](../../adr/0015-superseded-version-uses-the-same-page.md) | 2026-11-04 | A replaced version uses the same page, marked "Read-only" |
| [0016](../../adr/0016-web-validates-api-responses.md) | 2026-11-04 | A response is validated before findings are shown |
| [0021](../../adr/0021-previous-review-stays-readable-in-full.md) | 2026-11-04 | During a run or after a failure, the last completed review stays readable in full, labelled "Previous review" |

## Terms

- **Finding:** one flagged clause: severity, clause (or none), title, excerpt (or none), explanation.

## Backend

### Contract

Exact shape: `CompletedReview` in `packages/contract` (`documents`), on route `getDocument`.

### Happy path

- **AC-1:** WHEN a document has a completed review, THE SYSTEM SHALL return the latest one with who, when, counts for high, medium and low, and each finding's severity, clause, title, excerpt and explanation.
- **AC-2:** THE SYSTEM SHALL order findings by severity, high first, then by clause number in natural order (4.2 before 12.1), with findings without a clause last. Sorting lives in `domain/`. JSON order is not by severity: in lease v2 medium comes before high. Every clause present in the samples is purely numeric.

### Unhappy path

- **AC-3:** IF a review is not `completed`, THEN THE SYSTEM SHALL NOT return its finding content (partner of AC-1; ADR-0002).
- **AC-4:** IF a review id is unknown, THEN THE SYSTEM SHALL answer `404` with `review_not_found` (partner of AC-1).

### Edge cases

- **AC-5:** WHEN a finding has no clause and no excerpt, THE SYSTEM SHALL return them as null. The samples have 3: no governing law (NDA), no data processing agreement (SaaS), no deadlock mechanism (shareholders).
- **AC-6:** WHEN a completed review has no findings, THE SYSTEM SHALL return an empty list with zero counts.
- **AC-7:** WHEN a superseded version is requested, THE SYSTEM SHALL return its reviews and the current version's id and date (ADR-0004).
- **AC-8:** THE SYSTEM SHALL return all 18 findings of the franchise agreement (5 high, 8 medium, 5 low) under the same order rules.

## Frontend

The screen shows findings in the order the API gives and does not sort them.

### Happy path

- **AC-9:** WHEN the latest completed review is opened, THE SYSTEM SHALL show "Review result · date · requested by", counts for high, medium and low, and each finding's severity, clause, title, excerpt and explanation, in the API's order.

### Unhappy path

- **AC-10:** IF a review did not complete, THEN THE SYSTEM SHALL show no finding content of that review; the last completed review stays readable in full, labelled "Previous review" during a run and "Earlier result" after a failure (partner of AC-9; ADR-0002, ADR-0021).
- **AC-14:** IF the API does not answer, or its response fails validation, THEN THE SYSTEM SHALL show a short error message and a "Retry" button that repeats the failed call, with no finding content (partner of AC-9; ADR-0016).

### Edge cases

- **AC-11:** WHEN a finding has no clause, THE SYSTEM SHALL show "Not in the contract".
- **AC-12:** WHEN a completed review has no findings, THE SYSTEM SHALL show "Reviewed — no issues flagged."
- **AC-13:** WHEN a superseded version is opened, THE SYSTEM SHALL use the same page, marked "Read-only", with a banner "This version was replaced by the version of 24 Sep" with a link, and label its past reviews "review of an outdated version" (ADR-0004, ADR-0015).

## To check in manual testing

Decisions the source documents did not settle. Each is built as written, and can change after the human tries it.

- **Findings with equal severity and clause** keep their arrival order.
- **A clause that is not a number** sorts after numeric ones. The samples have none, so nobody has seen it.
- **The banner on a replaced version** names the newest version in the chain, not the next one, with its upload date (AC-7, AC-13).
- **Only the latest completed review** is returned. Older ones are stored but cannot be read, and a replaced version shows only its own latest.
- **After a failure,** the last completed review stays readable in full, muted, under "Earlier result" (ADR-0021, AC-32 of request-review).
- **A replaced version** shows a badge "review of an outdated version" inside its block, in addition to the normal label; the banner's link reads "Open the newest version".
- **Counts line:** "1 high · 1 medium · 1 low". The source documents give no format.

## Out of scope

- Editing or commenting on findings.
- Review history: reviews are stored, but not returned as a list or shown.

## How to verify

```bash
pnpm test
```

Tests carry AC ids: `.claude/bin/trace <feature>` lists what is not covered. Screen tests run under Vitest with Testing Library and `jsdom` (ADR-0017), which is not a real browser, so check the frontend by hand too.

## Changes

- 2026-11-05 — AC-10: after a failure the older result is labelled "Earlier result".
- 2026-11-04 — AC-10: the ban covers the review that did not complete; the last completed one stays readable — ADR 0021.
- 2026-11-04 — No criterion changed: "How to verify" now says screen tests run under Vitest with Testing Library (ADR 0017).
- 2026-11-04 — Added "To check in manual testing": decisions the source documents did not settle.
- 2026-11-04 — No criterion changed: the backend is built, and tests carry AC ids.
- 2026-11-04 — AC-13: the same page, marked "Read-only" — ADR 0015.
- 2026-11-04 — AC-14: also covers a response that fails validation — ADR 0016.
