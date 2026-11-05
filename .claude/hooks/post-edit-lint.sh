#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit) — lint the edited file, surface errors and warnings as additionalContext.
# Stack-agnostic: the command (`commands.lint`, {file} placeholder) and globs (`lintMatch`) come from
# gates.json; no linter configured → no-op. Does NOT modify the file (no --fix) — keeps Claude's
# file-state tracking consistent.
set -uo pipefail
. "$(dirname "$0")/gates-lib.sh"

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0

lint=$(gate_get '.commands.lint')
[ -z "$lint" ] && exit 0
rel=$(rel_path "$path")
gate_list '.lintMatch' | glob_match_any "$rel" || exit 0
gate_list '.protectedGlobs' | glob_match_any "$rel" && exit 0

# GNU `timeout` is absent on stock macOS (`gtimeout` with coreutils); without either, run unbounded.
TIMEOUT_BIN=$(command -v timeout || command -v gtimeout || true)
with_timeout() { local secs=$1; shift; if [ -n "$TIMEOUT_BIN" ]; then "$TIMEOUT_BIN" "$secs" "$@"; else "$@"; fi; }

placeholder='{file}'
quoted=$(printf '%q' "$path")
cmd=""
rest=$lint
while case "$rest" in *"$placeholder"*) true ;; *) false ;; esac; do
  cmd="$cmd${rest%%"$placeholder"*}$quoted"
  rest=${rest#*"$placeholder"}
done
cmd="$cmd$rest"

cd "$PROJECT_DIR" || exit 0
output=$(with_timeout 30 bash -c "$cmd" 2>&1)
status=$?

# Clean runs stay silent; anything failing or mentioning a warning is surfaced (first 60 lines).
if [ "$status" -ne 0 ] || printf '%s' "$output" | grep -qi 'warn'; then
  ctx="Linter (exit $status) on $rel — \`$cmd\`:
$(printf '%s\n' "$output" | head -60)"
  jq -nc --arg ctx "$ctx" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
fi

exit 0
