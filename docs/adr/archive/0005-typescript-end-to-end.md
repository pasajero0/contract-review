# 0005. TypeScript end to end, with SQLite

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** All features (project-wide decision)

## Context

The solution needs a web frontend, a backend API and a relational database, within 4 hours. It will be discussed and probably changed live. The reference stack (Next.js, Django, PostgreSQL) earns no extra points. The brief says SQLite is fine.

## Decision

We use Next.js, a Node API on Fastify, and SQLite through `node:sqlite`, in a pnpm monorepo with no Docker.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Next.js with Django Ninja | More risk inside the timebox and in the live discussion: not the language the author is fluent in |
| PostgreSQL instead of SQLite | Another service to run, against one command to start and no Docker |
| `better-sqlite3` | Needs an install and a native build. It stays the fallback |

## Consequences

- **Good:** one language; `node:sqlite` needs no install (POC Q1).
- **Bad, accepted:** `node:sqlite` is experimental and prints `ExperimentalWarning`. Being synchronous on one connection, it cannot show real concurrency problems.
- **Follow-ups:** PostgreSQL would need real concurrency tests and a row lock on the workspace.
