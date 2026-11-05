# 0018. Reads need no lawyer identity

- **Status:** Accepted
- **Date:** 2026-11-04
- **Applies to:** [documents-list](../../specs/documents-list/SPEC.md)

## Context

There is no authentication: a lawyer picks themselves in the interface, and all lawyers see the same data. The screen needs the list of lawyers before anyone is chosen. An earlier criterion read as if every request needed `X-Lawyer-Id`.

## Decision

`X-Lawyer-Id` is required only where a request records who acted: `POST /documents/:id/reviews`. Reads ignore it, even if it names an unknown lawyer. The web app still sends it with every request.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Require it everywhere except `GET /lawyers` | Rejects reads for no benefit, since every lawyer sees the same data |
| Reject an unknown lawyer on reads | One more check that protects nothing: there is no authentication |

## Consequences

- **Good:** the first screen works before a lawyer is chosen.
- **Bad, accepted:** anyone who can reach the API can read everything, which is true of this exercise anyway.
- **Follow-ups:** real authentication would replace this.
