---
description: Where each kind of project document goes and how specs and ADRs link; fires when a Markdown file is written or changed
paths:
  - "**/*.md"
---

# Documentation layout

## Do
- Put a feature's spec in `docs/specs/<feature>/SPEC.md`: purpose, Decisions table, Backend, Frontend, in one file — detect: `^docs/specs/[a-z-]+/SPEC\.md$` — severity: critical
- Put a decision in `docs/adr/NNNN-<title>.md`, one decision per file — detect: `^docs/adr/[0-9]{4}-[a-z0-9-]+\.md$` — severity: critical
- Put how the code is organised in `docs/architecture/` — detect: `^docs/architecture/(overview|backend|frontend)\.md$` — severity: critical
- Link both ways: a spec's Decisions table lists each ADR with its date and what it means there, a criterion that follows from one cites it (`ADR-0003`), and the ADR lists the specs under "Applies to" — severity: critical
- When a decision changes, write a new ADR with `Supersedes`, then update the spec's table and its "Changes" section — severity: critical
- Record a decision the source documents did not settle: an ADR if it is a real decision, and a bullet in the spec's "To check in manual testing" section, so the human confirms it by hand — severity: critical
- Link every new spec from `CODEMAP.md`; it is the map of the repository — severity: warning
- Keep API shapes in `packages/contract`; a spec only names them once they are built — severity: warning

## Don't
- Don't create a Markdown file elsewhere. Allowed besides the above: root `README.md`, `CLAUDE.md`, `CODEMAP.md`, `docs/adr/README.md`, `docs/poc/*.md`, `docs/ai-log/`, `docs/adr/decisions.md`, `docs/adr/archive/`, `.claude/**` — severity: critical
- Don't split a feature's spec into several files: `spec-gate` and `trace` read only `SPEC.md` — severity: critical
- Don't mix sides within a section: a status code goes under Backend, a text on screen under Frontend — severity: critical
- Don't repeat what the code says: fields, tables, import rules — severity: warning
- Don't write a spec for mechanical work such as a scaffold — severity: warning

## Why
Without this, documents pile up and mix why, what and how, so nobody can find or trust them. This rule only advises: the block is `docs-guard.sh`.
