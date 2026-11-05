# 0019. What the plan numbers mean

- **Status:** Accepted (adds to 0011)
- **Date:** 2026-11-04
- **Applies to:** [documents-list](../specs/documents-list/SPEC.md), [request-review](../specs/request-review/SPEC.md)

## Context

The header reads "Used 4 of 10 · 1 running · resets on 1 December". The brief charges only successful reviews, but a running review holds a slot (0011). So "used" could mean either completed reviews, or completed plus running.

## Decision

`used` counts completed reviews this month. `running` counts running reviews that are not overdue. `remaining` is `limit − used − running`, never below 0. `canRequest` and `GET /quota` read the same count.

With 9 completed and 1 running, the header says "Used 9 of 10 · 1 running", and a request is rejected with `plan_exhausted`.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| `used` includes running reviews | A review that then fails would make "used" go down, which reads as an error |
| `remaining` ignores running reviews | It would offer a slot that a request then rejects |

## Consequences

- **Good:** the numbers match what the brief charges, and a slot on hold is visible.
- **Bad, accepted:** the text "10 of 10 used" on a disabled button (AC-29 of request-review) is not literally true for 9 + 1. To check in manual testing.
- **Follow-ups:** none.
