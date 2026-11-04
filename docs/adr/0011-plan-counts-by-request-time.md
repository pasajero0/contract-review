# 0011. Count the plan by request time, with a reservation

- **Status:** Proposed
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md), [documents-list](../specs/documents-list/SPEC.md)

## Context

Reviews that fail do not count, so the final count is known only when a review ends. A review can start on the 31st and end on the 1st. Two requests can compete for the last slot.

## Decision

`available = planLimit − (reviews requested this month that are completed, or running with the deadline not passed)`. The month is the month of the request, in the workspace time zone. Check and insert run in one immediate transaction, with no `await` inside.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Count by finish time | A lawyer who confirmed "1 of N remaining this month" on the 31st would be charged next month |
| Count only completed reviews | With 9 completed and 1 running, an 11th review could start and exceed the plan |
| A stored counter | It must be kept in step with every outcome and can drift. Counting from `reviews` cannot |

## Consequences

- **Good:** the slot is reserved at request time, so everything meets at one point. Nothing is reset: earlier months fall out of the count.
- **Bad, accepted:** a running review blocks the last slot for up to 60 seconds, even if it then fails.
- **Follow-ups:** PostgreSQL would need a row lock on the workspace.
