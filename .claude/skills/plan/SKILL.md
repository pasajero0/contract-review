---
description: Break a merged stage spec into tasks in .claude/tmp/<stage>/tasks.json — every acceptance criterion covered, each task with a verify command and a model tier — on a stage branch. Use when the user says "/plan", "break it down", or right after a spec MR is merged.
argument-hint: "<stage id, e.g. A0>"
---

# Plan stage $ARGUMENTS

## Preconditions

- The spec is merged: `git cat-file -e origin/<base>:<specsDir>/$ARGUMENTS/SPEC.md` succeeds (`git fetch`
  first; `baseBranch` and `specsDir` are in `.claude/gates.json`). If not — stop: no plan before the merge.
- Read the merged spec in full, and the ADRs it links.

## Steps

1. **Work on a stage branch:** update the base branch, then `git checkout -b f-$ARGUMENTS`.
   The stage comes from the branch name (`stagePattern` in `.claude/gates.json`) — that is what opens the
   spec-gate for this stage and nothing else.
2. **Write `.claude/tmp/$ARGUMENTS/tasks.json`** (the file can be written once — after that only
   `.claude/bin/verify` updates it; to re-plan, `rm` it and write a new one):

   ```json
   { "stage": "$ARGUMENTS",
     "tasks": [
       { "id": "T1", "ac": ["AC-1", "AC-2"], "desc": "red tests for AC-1, AC-2",
         "tier": "S", "verify": "<command that fails now and passes when T1 is done>", "passes": false } ] }
   ```

   - **Every AC id appears in at least one task.** Every task lists its ACs.
   - **Tests first:** the first task(s) write failing tests (via `test-writer`). Every test names its
     criterion with the stage in front — `it("$ARGUMENTS AC-3: counts duplicates")`,
     `def test_$ARGUMENTS_AC_3_counts_duplicates()` — so `.claude/bin/trace` can link spec and tests.
     Implementation tasks come after and make those tests pass.
   - **Last task:** `"verify": ".claude/bin/trace && .claude/bin/health && <full test command>"` — every
     criterion has a test, no test invents one, code health within its SLOs, everything green.
   - **`verify` is a real check of this task only** — tests filtered by AC id, a type check, a script.
     Never `true`, never the whole suite unless the task is "everything green".
   - **One task = one reviewable step** (roughly one commit). Split anything bigger.
3. **Assign a tier** to each task — it picks the implementer's model:

   | Tier | When | Implementer model |
   | --- | --- | --- |
   | S | mechanical, one file, pattern already in the codebase | `sonnet`, low effort |
   | M | normal feature work across a few files | `sonnet` |
   | L | new design, concurrency, data migration, security, money, auth | `opus` |

   After two failed `verify` runs a task moves one tier up (the runner prints the hint).
4. **Run `.claude/bin/verify`** once: test tasks should fail now (red) — that proves the checks work.
5. Show the plan to the human as a table (id, ACs, tier, verify) before implementing.

## Then

Implement one task at a time with the `implementer` subagent (model per tier), run
`.claude/bin/verify <id>` after each, commit, next. Report with the contract from CLAUDE.md.
