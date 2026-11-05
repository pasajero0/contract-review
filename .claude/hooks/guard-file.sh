#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit|NotebookEdit) guard — protects the harness itself, generated + secret files.
set -euo pipefail
. "$(dirname "$0")/gates-lib.sh"
require_jq

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -z "$path" ] && exit 0
rel=$(rel_path "$path")

# Harness self-protection — the enforcement layer is edited by a human, never by the agent.
# Without this one Edit could switch any guard off. (Bash writes are not covered: blocklist, not a sandbox.)
case "$path" in
  *.claude/hooks/*|*.claude/bin/*|*.claude/settings.json|*.claude/settings.local.json|*.claude/gates.json)
    echo "Blocked: $rel is part of the harness enforcement layer — only a human edits it, by hand." >&2
    exit 2
    ;;
esac

# A stage plan: only .claude/bin/verify updates `passes`. A new plan may be written, all tasks unproven.
case "$rel" in
  .claude/tmp/*/tasks.json)
    if [ -e "$PROJECT_DIR/$rel" ]; then
      echo "Blocked: $rel is updated only by .claude/bin/verify. To re-plan, delete it (rm) and write a fresh plan." >&2
      exit 2
    fi
    if ! printf '%s' "$input" | jq -r '.tool_input.content // ""' |
      jq -e '(.tasks | type == "array") and ([.tasks[] | .passes == true] | any | not)' >/dev/null 2>&1; then
      echo "Blocked: a new $rel must be valid JSON with a tasks array and every task at \"passes\": false — only verify proves them." >&2
      exit 2
    fi
    ;;
esac

# Generated files and lockfiles (gates.json → protectedGlobs) — regenerate, never hand-edit.
if gate_list '.protectedGlobs' | glob_match_any "$rel"; then
  echo "Blocked: $rel is generated (build output or lockfile) — regenerate it, never edit it by hand." >&2
  exit 2
fi

case "$path" in
  *.env|*.env.*)
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "Editing an env file — it may contain secrets. Confirm before writing."
      }
    }'
    exit 0
    ;;
esac

exit 0
