# 0003. Reject requests beyond the plan, with no queue

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** [request-review](../../specs/request-review/SPEC.md), [documents-list](../../specs/documents-list/SPEC.md)

## Context

The plan has 10 reviews per calendar month for the whole workspace, and the samples have 12 current documents, so it really runs out. The product manager wants extra requests taken and run at the reset. The senior partner wants nobody spending a review unknowingly, and nobody believing a review is coming when it will not start for three weeks.

## Decision

We reject requests beyond the plan. The remaining plan is always visible: "Used 4 of 10 · 1 running · resets on 1 December". Before a request the lawyer sees "This uses 1 of your N remaining reviews — only if it completes", and on the last slot "This is the last review available this month". When the plan is used up, the button is disabled, with the reason and the reset date beside it.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Queue requests until the reset | Silently spends next month's plan and promises work that starts weeks later. Needs a `queued` status too |
| Reject with no visible plan and no confirmation | A lawyer could spend one of ten reviews without knowing it |

## Consequences

- **Good:** spending is always a conscious act; there is one state fewer.
- **Bad, accepted:** a lawyer must remember to come back after the reset.
- **Follow-ups:** `GET /quota` and `canRequest` in the API.
