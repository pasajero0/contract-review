# 0008. Guarantees live in the database; one row per review

- **Status:** Proposed. Narrowed by [0022](0022-two-rules-live-in-the-service-sql.md): two rules live in the service's SQL.
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

At most one review may run per document. A finished review must never change: late findings or a late completion must not turn a failed review into a completed one, or consume the plan. A bug in application code must not be able to break this.

## Decision

Each review is one row. Its facts (who, when, deadline) never change. Its outcome (status, failure reason, finished time) is written once, only from `running`. Findings are a separate table, insert-only. Plan usage is counted from `reviews`, never stored as a counter.

The database enforces this:
- a partial unique index on `reviews(document_id)` where `status = 'running'`;
- conditional updates: 0 rows changed means the event is late, so it is dropped and logged;
- triggers: the facts of a review cannot change, a finished review cannot change or get findings, findings cannot be updated or deleted, and reviews cannot be deleted, because deleting a finished one would free a plan slot;
- `STRICT` tables and a `CHECK` that ties status, reason and finished time together.

Analogy: a card authorisation, with a hold on request, capture on completion, and release on failure.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Event log as the only storage (event sourcing) | The partial index needs a status column. Without it the rule moves into code, and status and plan usage must be recomputed each time |
| Rules in application code only | One bug or race can complete a failed review |
| A database mock in tests | It hides exactly what we test, so tests use in-memory SQLite |

## Consequences

- **Good:** POC Q2 and Q3 hold: the index and triggers reject bad writes directly in tests.
- **Bad, accepted:** rules live partly in SQL, so they are harder to read and to port. `INSERT OR REPLACE` on reviews is not blocked; no code uses it.
- **Follow-ups:** an append-only `review_events` table is a next step for audit.
- **Lesson:** a `CHECK` passes on NULL, so `failure_reason IS NOT NULL` must be written explicitly.
