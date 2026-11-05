#!/usr/bin/env bash
# PreToolUse(Bash) guard — enforces hard prohibitions. Blocklist: catches mistakes, not a determined bypass.
set -euo pipefail
. "$(dirname "$0")/gates-lib.sh"
require_jq

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# git push — any form that still starts with git: global options (-C dir, --no-pager, -c k=v), env
# prefixes, `bash -c '…'`, `$(…)`. `git stash push` and commit messages that mention push stay allowed.
GIT_OPTS='([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace)[[:space:]]+[^[:space:]]+|[[:space:]]+-[^[:space:]]+)*'
if printf '%s' "$cmd" | grep -Eq "${CMD_START}git${GIT_OPTS}[[:space:]]+push([[:space:];&|)\`\"']|\$)"; then
  echo "Blocked: 'git push' is manual-only — a human pushes by hand." >&2
  exit 2
fi

# Merging a PR/MR is the human's approval (a merged spec opens the spec-gate) — never the agent's.
if printf '%s' "$cmd" | grep -Eq "${CMD_START}((gh|glab)[[:space:]]+(pr|mr)[[:space:]]+merge|gh[[:space:]]+api[[:space:]].*/merge)"; then
  echo "Blocked: merging is the human's approval step — ask the human to review and merge." >&2
  exit 2
fi

# Foreign package managers (from gates.json).
forbidden=$(gate_list '.forbiddenPackageManagers' | paste -sd '|' -)
if [ -n "$forbidden" ] && printf '%s' "$cmd" | grep -Eq "${CMD_START}(${forbidden})([[:space:]]|\$)"; then
  echo "Blocked: this repo uses $(gate_get '.packageManager') only." >&2
  exit 2
fi

# Installing anything from outside: ask in interactive mode, never in autonomous mode.
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  if printf '%s' "$cmd" | grep -Eq "${CMD_START}(${pat})"; then
    if [ "$(gate_get '.mode')" = "autonomous" ]; then
      echo "Blocked: autonomous mode never installs anything. Record it under NEEDS HUMAN DECISION and move on." >&2
      exit 2
    fi
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: "This command installs something from outside the repo. Confirm first."
      }
    }'
    exit 0
  fi
done < <(gate_list '.installPatterns')

exit 0
