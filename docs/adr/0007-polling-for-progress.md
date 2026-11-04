# 0007. Poll for progress while a review runs

- **Status:** Proposed. **Not checked by the POC:** the POC page does not poll.
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

All three lawyers must follow a running review. It lasts at most 60 seconds, and the screen shows only a count and elapsed time.

## Decision

The web app polls every 1–2 seconds, only while a review is running, using TanStack Query with a conditional refetch interval. Elapsed time is computed from `serverTime`, not the browser clock.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Server-sent events | More to build for a count that changes a few times. It is the next step if polling is not enough |
| WebSocket | Two-way connection for one-way data: too much for this |

## Consequences

- **Good:** plain HTTP, no connection state on the server.
- **Bad, accepted:** progress is up to 2 seconds late, and each open page sends requests during a run.
- **Follow-ups:** none.
