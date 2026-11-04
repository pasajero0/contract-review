# 0014. Build the final solution on the POC

- **Status:** Proposed. Replaces A5 of the former `decisions.md`: "its findings, not its code, go into the real solution".
- **Date:** 2026-11-04
- **Applies to:** All features (project-wide decision)

## Context

The POC was planned as throwaway. It ended with a working scaffold and a server side that passes 109 tests, a code review and checks on real processes. The brief's timebox is 4 hours. Tag `poc-end` marks where the POC stopped.

## Decision

We continue in this repository, keeping the scaffold and the checked server code, and change them to match the specs.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| A new repository, with the code written again | Time spent again on what already works, with no gain for the rules |

## Consequences

- **Good:** the time goes on the screens and the missing API.
- **Bad, accepted:** the code keeps its POC shape where nobody revisits it, and "throwaway" no longer holds. The POC's review suggestions must be fixed or stated as limitations.
- **Follow-ups:** rename tests to carry AC ids, so that `trace` can link them.
