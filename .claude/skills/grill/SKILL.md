---
description: Grill the user about a feature, plan or design before any spec or code — walk the decision tree in numbered rounds, each question with a recommended answer, until nothing is left open. Then record decisions as ADRs and edge cases in the spec draft. Use when the user says "grill me", "/grill", "stress-test this idea", or starts a new stage.
argument-hint: "[what to grill: a feature, a stage, a design]"
disable-model-invocation: true
---

# Grill

Interview the user relentlessly until you both share one understanding of **$ARGUMENTS** — then write it
down. Nothing gets built during a grill. (Method after `grilling` in mattpocock/skills, MIT.)

## How

1. **Map the decision tree.** Every decision opens dependent decisions. The *frontier* is every
   question whose prerequisites are already settled.
2. **Ask in rounds.** One round = the whole current frontier, numbered and formatted like this:

   > ❓ **3. Duplicate events** — When the same `eventId` arrives twice, do we drop it silently or
   > count it in a `duplicates` field?
   > ➡️ Recommended: count it — callers can see retries without failing the batch.

   Word each question so that "yes" accepts the recommendation. Always recommend; never ask open-ended.
3. **Facts are your job, decisions are the user's.** Never ask the user what the code, the docs or the
   environment can tell you — look it up yourself (delegate to the `researcher` subagent for wide
   searches). Questions that depend on a pending lookup wait; the rest of the frontier goes ahead.
4. **Recompute after each answer.** Answers settle branches and reveal new ones. Keep going until the
   frontier is empty and every branch has been visited.
5. **Hunt for the unhappy paths.** For every happy path ask what fails: invalid input, duplicates,
   timeouts, partial failure, concurrency, limits, permissions, empty and huge data. These become edge
   cases in the spec.

## Output (only after the user confirms the shared understanding)

- **Decisions with alternatives** → one ADR each via `/adr` (context, decision, rejected options and why).
- **Edge cases, limits, failure behaviour** → the "Edge cases" and unhappy-path sections of the stage's
  spec draft (`/spec`), as EARS criteria where possible.
- **Still open** → listed under NEEDS HUMAN DECISION, never guessed.

Finish with a short summary: decisions taken, ADRs written, edge cases captured, questions still open.
