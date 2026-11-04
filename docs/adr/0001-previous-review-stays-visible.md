# 0001. Keep the previous review visible while a new one runs

- **Status:** Proposed
- **Date:** 2026-11-04
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

The product manager wants the previous review on screen, so a lawyer never waits in front of nothing. The senior partner wants nothing that is old or partial to be readable as final. A review can take up to 60 seconds.

Principle for all disputed points: the partner's requirements are about trust in a legal result, so they win over convenience. Where both can be met with clear labelling, we meet both.

## Decision

We show the latest completed review as a separate block, "Previous review · date · requested by", with a banner saying a new review is running.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Hide the previous review during a run | The lawyer loses a usable result for up to 60 seconds and waits in front of nothing |
| Show it in the normal result block | An old result could be read as the current one, which the partner refuses |

## Consequences

- **Good:** both people's needs are met; the screen is never empty.
- **Bad, accepted:** the page has more states, and the labels must be hard to miss.
- **Follow-ups:** the API returns `current` and `latestCompleted` separately.
