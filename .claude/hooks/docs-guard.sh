#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit) guard: a Markdown file may be written only where docs-layout.md allows.
set -euo pipefail

input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$path" ] && exit 0
rel=${path#"${CLAUDE_PROJECT_DIR:-$PWD}"/}

case "$rel" in /*) exit 0 ;; esac

case "$rel" in
  *.md) ;;
  *) exit 0 ;;
esac

[[ "$rel" =~ ^(README|CLAUDE|CODEMAP)\.md$ ]] && exit 0
[[ "$rel" =~ ^\.claude/ ]] && exit 0
[[ "$rel" =~ ^docs/specs/[a-z-]+/SPEC\.md$ ]] && exit 0
[[ "$rel" =~ ^docs/adr/([0-9]{4}-[a-z0-9-]+|README)\.md$ ]] && exit 0
[[ "$rel" =~ ^docs/architecture/(overview|backend|frontend)\.md$ ]] && exit 0
[[ "$rel" =~ ^docs/poc/[a-z0-9-]+\.md$ ]] && exit 0
[[ "$rel" == "docs/adr/decisions.md" ]] && exit 0
[[ "$rel" =~ ^docs/adr/archive/[A-Za-z0-9-]+\.md$ ]] && exit 0
[[ "$rel" =~ ^docs/ai-log/ ]] && exit 0


echo "Blocked by docs-guard: $rel is not an allowed place for a document. Spec: docs/specs/<feature>/SPEC.md. Decision: docs/adr/NNNN-<title>.md. Architecture: docs/architecture/. See .claude/rules/docs-layout.md." >&2
exit 2
