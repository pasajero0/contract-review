# 0022. Two review rules live in the service's SQL

- **Status:** Accepted (narrows 0008)
- **Date:** 2026-11-05
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

A code review found that the database accepts a review inserted as finished, and accepts a finish after the deadline on an overdue row the sweeper has not reached yet. 0008 said a bug in application code must not be able to break these rules.

## Decision

Finished reviews are frozen by a trigger; inserting a review as finished and finishing after the deadline are prevented by the service's conditional SQL, not by the database. The test seed helpers write finished reviews directly, so a database rule would block them.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| A `CHECK` on the deadline and a `BEFORE INSERT` trigger now | Every seed helper would have to insert as running and update afterwards, for no change in behaviour today |

## Consequences

- **Good:** the documents now say what the database really enforces.
- **Bad, accepted:** a bug in the service's SQL could break these two rules.
- **Follow-ups:** database-level protection is listed under "What's next" in the README.
