---
description: Write a stage spec (SPEC.md) with acceptance criteria in EARS notation — happy path, unhappy path, edge cases, numeric NFRs, verification commands — get it reviewed by the spec-reviewer subagent, and prepare it for a human-merged MR. Use when the user says "/spec", "write the spec", or a grill is finished.
argument-hint: "<stage id, e.g. A0>"
---

# Spec for stage $ARGUMENTS

A spec is approved when its MR is **merged into the base branch by a human**. Until then the spec-gate
hook blocks every code edit for the stage. So the spec must be good enough to build from without
asking again.

## Steps

1. **Grill first.** If the stage has not been grilled, run `/grill` — a spec written from guesses only
   moves the guessing later.
2. **Write** `<specsDir>/$ARGUMENTS/SPEC.md` (`specsDir` in `.claude/gates.json`, default `docs/specs`)
   from `${CLAUDE_SKILL_DIR}/template.md`.
3. **Acceptance criteria** — each one:
   - has a unique id (`AC-1`, `AC-2`, …) — tests will carry these ids in their names;
   - uses an EARS pattern (table in the template) and an observable outcome — something a test can check;
   - **every happy-path criterion has at least one unhappy-path partner** (`IF … THEN THE SYSTEM SHALL …`);
   - every edge case from the grill is either a criterion or listed under "Out of scope".
4. **NFRs only with numbers** ("p99 < 300 ms at 50 rps"), never "fast" or "scalable".
5. **How to verify** — the exact commands (tests filtered by AC id, load profile, manual check).
6. **Review.** Run the `spec-reviewer` subagent on the file. Fix every blocker; argue or fix the rest.
   Repeat until it returns PASS (max 3 rounds — then list what is left under NEEDS HUMAN DECISION).
7. **Hand over.** Commit the spec (and its ADRs) on a branch `spec/$ARGUMENTS`. Tell the human it is
   ready for review: they push, open the MR, review and merge. Never push yourself.

## Changing a merged spec

Requirements change; the spec must stay true. Change it in the stage branch, **before** the code:

1. Edit the criterion in place (do not leave the old one beside it) and add an entry under "## Changes":
   date — what changed (AC ids) — why (link the ADR if it was a decision).
2. Commit it alone: `spec: <stage> <what changed>`.
3. Then update the tests for the changed criteria (they must fail first), then the code.

The spec-gate enforces the order: code is closed while the spec has uncommitted edits, or when it differs
from the base branch without a "## Changes" entry. One MR carries both; the human reviews and merges once.
