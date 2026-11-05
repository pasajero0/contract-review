---
description: Record an architecture decision as a numbered ADR (context, decision, rejected alternatives, consequences). Use after a grill settles a decision, or when the user says "write an ADR", "/adr", "record this decision".
argument-hint: "[decision title]"
---

# ADR

Write one decision per file in the ADR directory — `adrDir` in `.claude/gates.json` (default
`docs/adr`). Number = highest existing number + 1, four digits: `0007-queue-for-ingest.md`.

1. Read the existing ADRs first: do not duplicate one, and mark an older ADR `Superseded by NNNN` if this
   one replaces it.
2. Fill `${CLAUDE_SKILL_DIR}/template.md`. Rules:
   - **Context** states the forces and constraints, with numbers where they exist — not the solution.
   - **Alternatives** — at least two real ones, each with what it would cost us. "Do nothing" counts.
   - **Consequences** — the good *and* the bad we accept. A decision without a downside is not written yet.
3. **A boundary decision becomes a rule.** If the ADR says one part of the code must not depend on another
   ("domain does not import infra"), end it with the proposed rule for `layers` in `.claude/gates.json`:
   `{ "name": "…", "files": ["src/domain/*"], "forbid": ["infra/"], "adr": "<this ADR>" }`. The human adds it
   (the agent cannot edit gates.json); from then on the arch-guard hook blocks new imports across it.
4. Status starts as `Proposed`. It becomes `Accepted` when its MR is merged by a human — same rule as specs.

Keep it short: an ADR is read in two minutes or it is not read.
