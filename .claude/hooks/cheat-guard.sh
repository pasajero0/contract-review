#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit) — blocks an edit that ADDS a skipped test or a suppressed check
# (.skip/.only, @ts-ignore, eslint-disable, a new `any`, pytest skip, # type: ignore, t.Skip, …).
# Each pattern (gates.json → cheatPatterns) is counted before and after the edit; only growth is
# blocked, so touching a file that already has one is fine. Runs before the write: a PostToolUse
# block cannot undo an edit. Docs and the harness itself are not checked.
set -euo pipefail
. "$(dirname "$0")/gates-lib.sh"
require_jq

[ "$(gate_get '.cheatGuard')" = "true" ] || exit 0

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0
rel=$(rel_path "$path")
case "$rel" in *.md | *.mdx | *.txt | .claude/*) exit 0 ;; esac

case "$(printf '%s' "$input" | jq -r '.tool_name // empty')" in
  Write)
    new=$(printf '%s' "$input" | jq -r '.tool_input.content // ""')
    old=$(cat "$path" 2>/dev/null || true)
    ;;
  Edit)
    new=$(printf '%s' "$input" | jq -r '.tool_input.new_string // ""')
    old=$(printf '%s' "$input" | jq -r '.tool_input.old_string // ""')
    ;;
  MultiEdit)
    new=$(printf '%s' "$input" | jq -r '[.tool_input.edits[]?.new_string] | join("\n")')
    old=$(printf '%s' "$input" | jq -r '[.tool_input.edits[]?.old_string] | join("\n")')
    ;;
  *) exit 0 ;;
esac

count() { printf '%s\n' "$2" | { grep -Eo -- "$1" 2>/dev/null || true; } | wc -l | tr -d ' '; }

while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  before=$(count "$pat" "$old")
  after=$(count "$pat" "$new")
  if [ "$after" -gt "$before" ]; then
    hit=$(printf '%s\n' "$new" | { grep -Eo -- "$pat" 2>/dev/null || true; } | head -n 1)
    echo "Blocked by cheat-guard: this edit adds \`$hit\` to $rel — a skipped test or a suppressed check. Fix the cause instead. If it is truly intended, a human adds it by hand." >&2
    exit 2
  fi
done < <(gate_list '.cheatPatterns')

exit 0
