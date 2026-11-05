# 0020. A document unknown to the AI engine fails the review

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

The fake engine finds a document's findings by id. In the POC, an id it did not know behaved as a document with no findings, so the review completed and the lawyer would read "Reviewed — no issues flagged". This is the same risk as in [0012](0012-unknown-severity-fails-review.md): a wrong result that looks final.

## Decision

An id missing from the engine's data makes the engine fail, and the review ends as `failed` / `ai_error`. An id mapped to an empty list still completes with no findings.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Treat it as no findings, as in the POC | Reads as "no issues" for a contract nobody reviewed |
| Check at start-up that every document has data | More code for a case the engine can already report at the moment it matters |

## Consequences

- **Good:** "no issues flagged" can only come from a real, empty result.
- **Bad, accepted:** the lawyer sees an AI error and retries, for what is really a data problem.
- **Follow-ups:** none.
