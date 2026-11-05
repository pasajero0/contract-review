# 0023. The document page polls every 10 seconds with no review running

- **Status:** Accepted. Decided by the human on 2026-11-05. Supersedes "only while a review is running" in [0007](0007-polling-for-progress.md), for the document page.
- **Date:** 2026-11-05
- **Applies to:** [request-review](../specs/request-review/SPEC.md)

## Context

A page that polled only while it knew of a running review did not show another lawyer's new run until the tab regained focus or the page reloaded. Manual testing found this, and AC-25 says every lawyer sees a run.

## Decision

The document page polls every 10 seconds when no review is running, and every 1–2 seconds while one runs. The list keeps polling only while a review is running.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Server-sent events | More to build; still the next step if polling is not enough |
| Poll every 1–2 seconds all the time | Many requests for a page where nothing is happening |

## Consequences

- **Good:** another lawyer's run shows up within 10 seconds.
- **Bad, accepted:** an idle open page sends a request every 10 seconds.
- **Follow-ups:** none.
