#!/usr/bin/env bash
# Stop — no "done" without evidence. Active only while the active stage has a tasks.json.
#   interactive: blocks a message that claims STATUS: DONE while a task is not passing, or that has
#                no EVIDENCE section.
#   autonomous:  also blocks stopping while any task is not passing, unless the agent reports
#                STATUS: BLOCKED or NEEDS HUMAN DECISION.
# Never blocks twice in a row (stop_hook_active): one nudge, then the human sees the real state.
# onFailure does not apply to Stop hooks, so this script fails open on bad input instead of crashing.
set -uo pipefail
. "$(dirname "$0")/gates-lib.sh"

input=$(cat)
[ "$(gate_get '.evidenceGate')" = "true" ] || exit 0
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ] && exit 0
tasks=$(tasks_file)
{ [ -n "$tasks" ] && [ -f "$tasks" ]; } || exit 0

msg=$(printf '%s' "$input" | jq -r '.last_assistant_message // empty' 2>/dev/null)
if [ -z "$msg" ]; then
  # Older Claude Code: fall back to the last assistant text block in the transcript.
  transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  if [ -n "$transcript" ] && [ -f "$transcript" ]; then
    msg=$(tail -n 200 "$transcript" | jq -rs '
      [.[] | select(.type == "assistant") | .message.content[]? | select(.type == "text") | .text]
      | last // empty' 2>/dev/null)
  fi
fi

failing=$(jq -r '[.tasks[] | select(.passes != true) | .id] | join(", ")' "$tasks" 2>/dev/null) || exit 0

block() {
  jq -nc --arg r "$1" '{decision: "block", reason: $r}'
  exit 0
}

# Report fields count only at the start of a line (markdown bold / heading allowed), not as words.
field() { printf '%s\n' "$msg" | grep -Eq "^[*#>[:space:]]*$1"; }

if field 'STATUS:[*[:space:]]*DONE'; then
  [ -n "$failing" ] &&
    block "You report STATUS: DONE, but these tasks are not passing: $failing. Run .claude/bin/verify and fix them — or report STATUS: IN PROGRESS / BLOCKED honestly."
  field 'EVIDENCE' ||
    block "STATUS: DONE needs an EVIDENCE section: the commands you ran and their real output (at least .claude/bin/verify)."
  trace_out=$("$PROJECT_DIR/.claude/bin/trace" 2>&1)
  [ $? -eq 1 ] &&
    block "STATUS: DONE, but criteria and tests do not line up: $trace_out"
  health_out=$("$PROJECT_DIR/.claude/bin/health" --quick 2>&1)
  [ $? -eq 1 ] &&
    block "STATUS: DONE, but a code-health SLO is broken: $health_out"
  exit 0
fi

if [ "$(gate_get '.mode')" = "autonomous" ] && [ -n "$failing" ] &&
  ! field 'STATUS:[*[:space:]]*BLOCKED' && ! field 'NEEDS HUMAN DECISION'; then
  block "Autonomous mode: tasks $failing are not passing yet. Keep going (.claude/bin/verify), or stop with STATUS: BLOCKED and a NEEDS HUMAN DECISION entry."
fi

exit 0
