# 0004. Superseded contract versions are read-only

- **Status:** Accepted (open point settled by 0015)
- **Date:** 2026-11-04
- **Applies to:** [documents-list](../../specs/documents-list/SPEC.md), [request-review](../../specs/request-review/SPEC.md), [read-result](../../specs/read-result/SPEC.md)

## Context

The samples hold two versions of the Via Tortona lease: v2 (24 Sep) `supersedes` v1. The high-severity clause 8.3 in v1 is fixed in v2, and v2 has a new high-severity clause 12.1. Each version is its own document. The brief does not mention versions, but says the data is part of the brief.

## Decision

A superseded version is listed under the current one, marked "replaced". Its reviews can be read, with a banner "review of an outdated version". A new review on it is rejected with `document_superseded`.

**Open:** UC3c says the button is disabled; UC9 says there is no button (`docs/poc/plan.md` §8). The proposal is to follow UC9. Not decided.

## Alternatives considered

| Option | Why not (what it would cost us) |
| --- | --- |
| Allow reviews of old versions | Spends the plan on text that was replaced |
| Hide old versions | Past reviews and their findings can no longer be read |

## Consequences

- **Good:** nobody can mistake an outdated review for a current one.
- **Bad, accepted:** one more state on the list and document screens.
- **Follow-ups:** `currentVersionId` returns the next version, which is wrong for v1 <- v2 <- v3. The samples have one link only.
