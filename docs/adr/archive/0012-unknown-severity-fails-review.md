# 0012. An unknown severity fails the whole review

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** [request-review](../../specs/request-review/SPEC.md)

## Context

Severity must be `high`, `medium` or `low`. All samples are valid, so this cannot happen with the fake AI today; a real model could send anything. The first POC approach dropped the bad finding and completed the review. If it was the only finding, the lawyer would see "no issues flagged" for a contract with a known issue.

## Decision

A finding with an unknown severity fails the whole review with `ai_error`.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Drop the finding and complete | A review that lost a finding looks complete |
| Store it as a default severity | Invents a legal judgement the AI did not make |

## Consequences

- **Good:** a completed review always holds every finding the AI sent.
- **Bad, accepted:** one bad finding loses the rest of the result, and the lawyer must retry. A failed review does not use the plan.
- **Follow-ups:** none.
