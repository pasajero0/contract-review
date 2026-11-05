# 0002. Show finding content only after a review completes

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** [request-review](../../specs/request-review/SPEC.md), [read-result](../../specs/read-result/SPEC.md)

## Context

The product manager wants each finding shown as soon as the AI returns it. The senior partner says that whatever is not final must be impossible to read as final.

The data shows the risk. In the new lease version the high-severity clause 12.1 arrives second. The franchise has 18 findings, so a failure at the 12th would look like a full review.

## Decision

While a review runs, we show progress only: "In progress · 7 findings so far · 23 s of 60". Content is shown only for a `completed` review. A failed one shows "did not complete after N findings — there is no result". We refuse the product manager's request here.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Show findings live inside an "incomplete" frame | A frame is easy to skim past, and it costs more to build |
| Show no progress at all | The lawyer waits in front of nothing |

## Consequences

- **Good:** a partial result cannot be mistaken for a final one; the API never sends content before completion.
- **Bad, accepted:** a lawyer waits up to 60 seconds to read anything, and the findings of a failed review are never shown.
- **Follow-ups:** a test that the API exposes no finding content during a run.
