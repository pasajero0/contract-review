# 0016. The web app validates every API response with Zod

- **Status:** Proposed. Settles the open point in [0010](0010-shared-contract-package.md).
- **Date:** 2026-11-04
- **Applies to:** All features (project-wide decision)

## Context

TypeScript types exist only at compile time: at run time a response can be anything, for example from a proxy or an older server. The POC's web app trusted the types. A wrong response must not reach the screen as if it were correct, since a lawyer reads the result as final.

## Decision

In `apps/web/src/api/`, each response starts as `unknown` and is parsed with its schema from `packages/contract` before anything else uses it. A response that fails is handled like an API that does not answer: a short error message and a "Retry" button.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Types only, as in the POC | Nothing checks a response at run time |
| Validate only in the API | Does not cover what happens between the API and the browser |

## Consequences

- **Good:** the correctness of what reaches a screen is checked, not assumed.
- **Bad, accepted:** responses are parsed twice, in the API and in the browser, and Zod is in the browser bundle.
- **Follow-ups:** none.
