# 0017. Proven libraries for polling and screen tests

- **Status:** Proposed
- **Date:** 2026-11-04
- **Applies to:** All features (project-wide decision)

## Context

The screens must poll while a review runs and stop when it ends, and their criteria should be tested automatically. Vitest runs tests, but cannot render a React component or click in it by itself. The timebox is short, and the goal is working mechanics.

## Decision

We use proven libraries rather than write these by hand: `@tanstack/react-query` for fetching and polling; `@testing-library/react`, its peer `@testing-library/dom`, `@testing-library/user-event` and `jsdom` for screen tests under Vitest.

`jsdom` is pinned to 29.1.1, not the latest 30.1.3, because version 30 requires Node 22.22.2 and the project pins Node 22.21.1.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Hand-written polling | Timers, cleanup and errors to write and test for what a library already does |
| Manual checks of screens only | Screen criteria would not be tested, and testing is part of the evaluation |
| Vitest browser mode | Needs a real browser and more setup |

## Consequences

- **Good:** less code to write and defend.
- **Bad, accepted:** five more packages. `jsdom` is not a real browser, so a manual pass is still needed.
- **Follow-ups:** none.
