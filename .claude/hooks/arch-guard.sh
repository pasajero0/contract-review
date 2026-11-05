#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit) — architecture boundaries. gates.json → layers:
#   [{ "name": "domain stays pure", "files": ["src/domain/*"], "forbid": ["infra/", "/db/"], "adr": "docs/adr/0003-layers.md" }]
# An edit to a file matching `files` may not ADD an import line (import / from / require / use / include)
# that matches a `forbid` regex. Counted before and after, like cheat-guard: existing violations do not
# block unrelated work, new ones do. Boundaries are architecture decisions: an ADR records them and the
# human edits the rule. Language-agnostic by design — it reads import lines, not syntax trees.
set -euo pipefail
. "$(dirname "$0")/gates-lib.sh"
require_jq

[ "$(gate_get '.layers | length')" -gt 0 ] 2>/dev/null || exit 0

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0
rel=$(rel_path "$path")

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

import_lines() {
  printf '%s\n' "$1" | { grep -E '(^|[^A-Za-z0-9_])(import|from|require|use|include)([^A-Za-z0-9_]|$)' || true; }
}
count() { printf '%s\n' "$2" | { grep -Eo -- "$1" 2>/dev/null || true; } | wc -l | tr -d ' '; }

new_imports=$(import_lines "$new")
[ -z "$new_imports" ] && exit 0
old_imports=$(import_lines "$old")

rules=$(gate_get '.layers | length')
i=0
while [ "$i" -lt "$rules" ]; do
  if gate_list ".layers[$i].files" | glob_match_any "$rel"; then
    name=$(gate_get ".layers[$i].name")
    adr=$(gate_get ".layers[$i].adr")
    while IFS= read -r pat; do
      [ -z "$pat" ] && continue
      if [ "$(count "$pat" "$new_imports")" -gt "$(count "$pat" "$old_imports")" ]; then
        line=$(printf '%s\n' "$new_imports" | { grep -E -- "$pat" || true; } | head -n 1)
        echo "Blocked by arch-guard: $rel is in layer '${name:-#$i}', which may not depend on /$pat/ — \`$line\`.${adr:+ See $adr.} Move the code, or if the architecture really changes, write an ADR and ask the human to update layers in .claude/gates.json." >&2
        exit 2
      fi
    done < <(gate_list ".layers[$i].forbid")
  fi
  i=$((i + 1))
done

exit 0
