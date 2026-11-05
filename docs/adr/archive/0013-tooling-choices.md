# 0013. Tooling: Next.js defaults, exact versions, shadcn/ui

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** All features (project-wide decision)

## Context

The timebox is 4 hours, so compatibility work must stay small. Everything here was tried in POC Stage 1.

## Decision

- **Exact versions:** direct dependencies use the latest stable version, with no `^` or `~` (`save-exact=true`). Two exceptions, each for compatibility: `typescript` 6.0.3, because `typescript-eslint` 8.72.1 requires below 6.1.0; `@types/node` 22.20.5, because the types must match Node 22.
- **Next.js defaults:** ESLint and Vitest.
- **No `tsx`:** Node 22.21.1 runs TypeScript directly, with `.ts` import extensions and `erasableSyntaxOnly`.
- **UI:** shadcn/ui, preset Nova on Radix, copied into `apps/web/src/ui/`. Components added selectively: `button`, `badge`, `alert`, `alert-dialog`, `card`, `table`, `select`. We write no styles of our own; Tailwind only for page layout (`flex`, `gap`). Generated components go in a separate commit.
- **`cn`:** instead of `clsx` and `tailwind-merge`, because shadcn 4.23.0 installs it. `shadcn` is a runtime dependency because `globals.css` imports its CSS. The helper is in `src/ui/utils.ts`, because there is no `lib/` layer.
- **`agentRules: false`:** Next.js does not generate `AGENTS.md`; project rules live in `CLAUDE.md`.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Vite+ instead of ESLint and Vitest | Its documentation found during the POC does not mention Next.js, and it pins older `vitest` and `oxlint` |
| Component libraries with their own styling, or our own styles | More to write and to defend. Alert and Badge variants already give visibly different states for 0001 and 0002 |
| TypeScript 7.0.2 | `typescript-eslint` does not support it |

## Consequences

- **Good:** few moving parts; AlertDialog is accessible out of the box.
- **Bad, accepted:** `eslint-config-next` plugins do not officially support ESLint 10, which gives peer warnings and could break later. The Geist font comes through `next/font/google`, so `next dev` fetches it from Google.
- **Follow-ups:** none.
