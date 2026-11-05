---
stage: <stage id>
---

# <Stage title>

## Purpose

<What the user can do with this feature, and what already exists.>

## Decisions

| ADR | Recorded | What it means here |
|---|---|---|
| [NNNN](../../adr/NNNN-title.md) | YYYY-MM-DD | <one line> |

## Terms

<Domain words used below, one line each. Use the same word for the same thing everywhere.>

## Model and state transitions

| State | Event | New state | Criterion |
| --- | --- | --- | --- |
| <state> | <event> | <state> | AC-n |

<!-- Acceptance criteria use EARS: `THE SYSTEM SHALL …`, `WHEN <trigger>, THE SYSTEM SHALL …`,
     `WHILE <state>, THE SYSTEM SHALL …`, `IF <condition>, THEN THE SYSTEM SHALL …`,
     `WHERE <feature is enabled>, THE SYSTEM SHALL …`.
     AC ids run on through Backend and Frontend, so they stay unique in this file.
     A criterion that follows from a decision cites it: (ADR-NNNN). -->

## Backend

### Contract

<Name the shapes in `packages/contract`. Fields are described only there.>

### Happy path

- **AC-1:** WHEN <trigger>, THE SYSTEM SHALL <observable outcome> (ADR-NNNN).

### Unhappy path

- **AC-2:** IF <invalid input / failure>, THEN THE SYSTEM SHALL <observable outcome> (partner of AC-1).

### Edge cases

- **AC-3:** <duplicates, limits, empty input, concurrency, timeouts, permissions — each as a criterion>.

## Frontend

### Happy path

- **AC-4:** WHEN <trigger>, THE SYSTEM SHALL <what the lawyer sees>.

### Unhappy path

- **AC-5:** IF <failure>, THEN THE SYSTEM SHALL <what the lawyer sees> (partner of AC-4).

### Edge cases

- **AC-6:** <empty states, disabled controls — each as a criterion>.

## Non-functional requirements

- <metric> <threshold with a number> <under which load / where>.

## Out of scope

- <what this stage explicitly does not do, and edge cases deliberately left for later>.

## How to verify

```bash
<test command filtered by AC id, e.g. pnpm test -- -t "AC-"  /  pytest -k "AC_" >
```

## Changes

<Empty for the first version. Later: date — what changed in this spec and why (each change is its own MR).>
