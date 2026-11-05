#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit) — the spec always leads the code.
#  1. The stage (from the branch name, see gates-lib) needs a first spec merged into the base branch
#     (origin/<base> if present, else local <base>): a human approved the direction.
#  2. Later spec changes ride in the same branch and MR as the code, but ahead of it: while the spec has
#     uncommitted edits, code is closed; a committed spec that differs from the base must say what
#     changed under "## Changes". So history always reads "spec: …" before the code it explains.
# openPaths (docs, *.md, .claude/) stay open. gates.json → specGate: strict (default) | stage | off.
set -euo pipefail
. "$(dirname "$0")/gates-lib.sh"
require_jq

[ -f "$GATES_FILE" ] || exit 0 # harness without gates.json (older version): gate not configured
mode=$(gate_get '.specGate')
mode=${mode:-strict}
[ "$mode" = "off" ] && exit 0

path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -z "$path" ] && exit 0
rel=$(rel_path "$path")
case "$rel" in /*) exit 0 ;; esac # outside the project
gate_list '.openPaths' | glob_match_any "$rel" && exit 0

deny() {
  echo "Blocked by spec-gate ($rel): $1" >&2
  exit 2
}

stage=$(active_stage)
if [ -z "$stage" ]; then
  [ "$mode" = "stage" ] && exit 0
  deny "not on a stage branch. Work on a branch named after the stage (A0-ingest, feat/A0-ingest) — the stage comes from the branch name (stagePattern in .claude/gates.json)."
fi

specs=$(gate_get '.specsDir')
spec="${specs:-docs/specs}/$stage/SPEC.md"
cd "$PROJECT_DIR"
git rev-parse --git-dir >/dev/null 2>&1 || deny "not a git repository — the spec gate reads the merged spec from git."
ref=$(base_ref)
[ -n "$ref" ] || deny "base branch '$(gate_get '.baseBranch')' not found — set baseBranch in .claude/gates.json."

git cat-file -e "$ref:$spec" 2>/dev/null ||
  deny "$spec is not merged into $ref. The stage's first spec goes through its own MR, merged by a human (git fetch if it was just merged)."
git cat-file -e "HEAD:$spec" 2>/dev/null ||
  deny "this branch does not contain the merged $spec — merge or rebase on $ref first."
git diff --quiet HEAD -- "$spec" 2>/dev/null ||
  deny "$spec has uncommitted changes. Commit the spec change first (spec: …, with an entry under ## Changes), then the code."
if ! git diff --quiet "$ref" HEAD -- "$spec" 2>/dev/null; then
  [ "$(git show "$ref:$spec" | changes_section)" != "$(git show "HEAD:$spec" | changes_section)" ] ||
    deny "$spec differs from $ref, but its ## Changes section does not say what changed and why. Add the entry, commit it, then the code."
fi

exit 0
