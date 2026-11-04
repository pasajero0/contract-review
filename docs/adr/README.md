# Architecture decision records

A dated ledger of why a decision was made. An ADR is not edited: a new decision replaces an old one with a new entry, marked `Supersedes`. A status becomes `Accepted` when a human merges it.

Each ADR lists its features under "Applies to". Each spec lists its ADRs in a Decisions table, and a criterion that follows from one cites it, for example `ADR-0003`.

**Dates:** these ADRs were recorded on 2026-11-04. Most decisions were taken earlier, before the POC; the first commit of the old `decisions.md` is `0d15de0`, and git history has nothing older.

| ADR | Decision |
|---|---|
| [0001](0001-previous-review-stays-visible.md) | Keep the previous review visible while a new one runs |
| [0002](0002-findings-only-after-completion.md) | Show finding content only after a review completes |
| [0003](0003-no-queue-beyond-plan.md) | Reject requests beyond the plan, with no queue |
| [0004](0004-superseded-versions-are-read-only.md) | Superseded contract versions are read-only |
| [0005](0005-typescript-end-to-end.md) | TypeScript end to end, with SQLite |
| [0006](0006-modular-monolith-no-job-queue.md) | One process, with no job queue |
| [0007](0007-polling-for-progress.md) | Poll for progress while a review runs |
| [0008](0008-guarantees-live-in-the-database.md) | Guarantees live in the database; one row per review |
| [0009](0009-utc-storage-workspace-time-zone.md) | Store time as UTC epoch ms; compute months in the workspace time zone |
| [0010](0010-shared-contract-package.md) | Shared contract package with Zod |
| [0011](0011-plan-counts-by-request-time.md) | Count the plan by request time, with a reservation |
| [0012](0012-unknown-severity-fails-review.md) | An unknown severity fails the whole review |
| [0013](0013-tooling-choices.md) | Tooling: Next.js defaults, exact versions, shadcn/ui |
| [0014](0014-build-final-solution-on-the-poc.md) | Build the final solution on the POC |
| [0015](0015-superseded-version-uses-the-same-page.md) | A superseded version uses the same page, with no request button |
| [0016](0016-web-validates-api-responses.md) | The web app validates every API response with Zod |
| [0017](0017-proven-libraries-for-polling-and-screen-tests.md) | Proven libraries for polling and screen tests |
| [0018](0018-reads-need-no-lawyer-identity.md) | Reads need no lawyer identity |
| [0019](0019-what-the-plan-numbers-mean.md) | What the plan numbers mean |
| [0020](0020-unknown-document-fails-the-review.md) | A document unknown to the AI engine fails the review |
| [0021](0021-previous-review-stays-readable-in-full.md) | The previous review stays readable in full |

## Where the old ids went

`docs/poc/plan.md` and older notes use ids from the former `decisions.md` and `use-cases.md`. Both files are in git history, up to commit `d7706d5`.

| Old id | Now |
|---|---|
| D1, D2, D3, D4 | 0001, 0002, 0003, 0004 |
| A1 | 0005 |
| A2, A3, A12, A16 | [backend](../architecture/backend.md) |
| A17 | [frontend](../architecture/frontend.md) |
| A5 | Replaced by 0014 |
| A8, A9 | 0006 |
| A10 | 0007 |
| A11, A14, M16, M19 | 0008 |
| A13, M15 | 0009 |
| A15 | 0010 |
| A18, M6–M11 | 0013 |
| R1 | 0011 |
| R2, R3, R4 | [request-review](../specs/request-review/SPEC.md) |
| M18 | 0012 |
| M1–M5, M17 | `CLAUDE.md` |
| M12, M14, M20 | [backend](../architecture/backend.md) |
| M13 | [frontend](../architecture/frontend.md) |
| §B | [backend](../architecture/backend.md) |
| §L | [overview](../architecture/overview.md), [backend](../architecture/backend.md), [frontend](../architecture/frontend.md) |
| §C | `apps/api/src/db/schema.sql`; reasons in 0008 |
| §D | Specs; exact shapes in `packages/contract` |
| §G | "Alternatives considered" in each ADR; short list in `README.md` |
| §H, §I | Specs |
| §K | `README.md`, 0013 |
| UC1, UC2 | [documents-list](../specs/documents-list/SPEC.md) |
| UC3, UC4, UC6, UC7, UC8, UC10, UC11 | [request-review](../specs/request-review/SPEC.md) |
| UC5 | [read-result](../specs/read-result/SPEC.md) |
| UC9 | [documents-list](../specs/documents-list/SPEC.md), [read-result](../specs/read-result/SPEC.md) |
| Optional review history | Out of scope in [read-result](../specs/read-result/SPEC.md) |
