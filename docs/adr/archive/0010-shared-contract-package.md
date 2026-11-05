# 0010. Shared contract package with Zod

- **Status:** Accepted (open point settled by 0016)
- **Date:** 2026-11-04
- **Applies to:** All features (project-wide decision)

## Context

The web app and the API must agree on request and response shapes, and a change must break the build, not the running app. The web app must never import `apps/api`.

## Decision

Zod schemas live in `packages/contract`. The API validates and builds responses with them; the web app takes types with `z.infer`. Database types are not API types: the mapping lives in `http/`. The API builds each response as a typed value first, then calls `parse`.

**Planned, not built:** one file per subject (`reviews.ts`, `documents.ts`, `quota.ts`, `lawyers.ts`, `errors.ts`), imported as `@lex-poc/contract/reviews` with no shared `index`. Each route is a plain object with its method, path and responses, used by both Fastify and the web client. Fields then live only here, and specs only name them. Behaviour stays in specs: when a request is rejected, the order of checks, and on-screen text cannot be expressed in a schema. Subpath imports in Next.js and Node are not checked yet.

**Open:** §L says the web app uses "types only"; A15 says it may validate responses (`docs/poc/plan.md` §8). The POC uses types only. Not decided for the real solution.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Generate a client from OpenAPI | An extra generation and sync step that pays off when clients are in another language or repository. OpenAPI can be emitted from these schemas later |
| Import types from `apps/api` | Pulls server code into the web app and couples them |

## Consequences

- **Good:** POC Q9: renaming a schema field fails `typecheck` in both apps.
- **Bad, accepted:** `parse` accepts `unknown`, so it gives no compile-time check by itself. This bypass happened twice in the POC. `parse` also strips extra fields, so tests must look at the raw body.
- **Follow-ups:** none.
