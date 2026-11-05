#!/usr/bin/env bash
# Shared helpers for the gate hooks — sourced, never registered as a hook itself.
# Everything stack-specific comes from .claude/gates.json; with no config the gates stay open.
# bash 3.2 compatible (stock macOS): no associative arrays, no mapfile.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
GATES_FILE="$PROJECT_DIR/.claude/gates.json"

# gate_get '.mode' → scalar value, empty when unset or no config.
gate_get() {
  [ -f "$GATES_FILE" ] || return 0
  # Not `// empty`: jq treats false as missing there, which would read "cheatGuard": false as unset.
  jq -r "($1) | if . == null then empty elif type == \"boolean\" then tostring else . end" \
    "$GATES_FILE" 2>/dev/null || true
}

# gate_list '.openPaths' → one item per line.
gate_list() {
  [ -f "$GATES_FILE" ] || return 0
  jq -r "($1 // [])[]" "$GATES_FILE" 2>/dev/null || true
}

# require_jq — PreToolUse guards call this first: without jq every check would silently pass
# (a crashed hook is a non-blocking error), so block and say why instead.
require_jq() {
  command -v jq >/dev/null 2>&1 && return 0
  echo "Blocked: jq is not on PATH, so the harness guards cannot run. Install jq (or ask the human)." >&2
  exit 2
}

# canon_dir <dir> → physical path (symlinks resolved: /var → /private/var on macOS).
canon_dir() { (cd -P "$1" 2>/dev/null && pwd -P); }

# rel_path <path> → path relative to the project root, both sides symlink-resolved, so a file_path
# under /private/var still matches a project dir under /var. Paths outside the project stay absolute.
rel_path() {
  local p=$1 dir rest root full
  case "$p" in /*) ;; *) p="$PROJECT_DIR/${p#./}" ;; esac
  dir=$(dirname "$p")
  rest=$(basename "$p")
  # The file (and its parent dirs) may not exist yet — resolve the deepest existing ancestor.
  while [ ! -d "$dir" ] && [ "$dir" != "/" ]; do
    rest="$(basename "$dir")/$rest"
    dir=$(dirname "$dir")
  done
  full="$(canon_dir "$dir")/$rest"
  full=${full#//}
  root=$(canon_dir "$PROJECT_DIR")
  case "$full" in
    "$root"/*) printf '%s' "${full#"$root"/}" ;;
    *) printf '%s' "$full" ;;
  esac
}

# glob_match_any <path> — true if the path matches any case-glob read from stdin.
glob_match_any() {
  local path=$1 pat
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    # shellcheck disable=SC2254 — the pattern is meant to glob.
    case "$path" in $pat) return 0 ;; esac
  done
  return 1
}

# A shell command starts at a line start, after ; & | ( { or an opening quote / backtick
# (catches `bash -c '…'` and `$(…)`), optionally behind shell keywords (then, do, else, !),
# wrapper words or env assignments.
CMD_START='(^|[;&|({`"'"'"'])[[:space:]]*((env|command|exec|nohup|time|sudo|then|do|else|!)[[:space:]]+)*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*'

# active_stage → stage id taken from the current git branch, so the agent cannot quietly point the
# gates at another stage: the last path segment of the branch must match gates.json → stagePattern
# (capture group 1; default: letters+digits at the start — A0-ingest, feat/A0-ingest, spec/A0 → A0).
# Empty on a branch without a stage (main), on a detached HEAD, or outside git.
active_stage() {
  local branch pattern s
  branch=$(git -C "$PROJECT_DIR" symbolic-ref --quiet --short HEAD 2>/dev/null) || return 0
  pattern=$(gate_get '.stagePattern')
  [ -n "$pattern" ] || pattern='^([A-Za-z]+[0-9]+)([-_.]|$)'
  [[ "${branch##*/}" =~ $pattern ]] || return 0
  s=${BASH_REMATCH[1]}
  case "$s" in
    "" | *[!A-Za-z0-9._-]* | .*) return 0 ;;
  esac
  printf '%s' "$s"
}

# base_ref → the ref merged work is read from: origin/<baseBranch> if it exists, else the local branch.
# Empty when neither exists (or outside git).
base_ref() {
  local base
  base=$(gate_get '.baseBranch')
  base=${base:-main}
  if git -C "$PROJECT_DIR" rev-parse --verify -q "refs/remotes/origin/$base" >/dev/null 2>&1; then
    printf '%s' "origin/$base"
  elif git -C "$PROJECT_DIR" rev-parse --verify -q "refs/heads/$base" >/dev/null 2>&1; then
    printf '%s' "$base"
  fi
}

# changes_section → the body of the "## Changes" section of a spec read from stdin.
changes_section() { awk '/^## Changes/ { f = 1; next } /^## / { f = 0 } f'; }

tasks_file() {
  local s
  s=$(active_stage)
  [ -n "$s" ] && printf '%s' "$PROJECT_DIR/.claude/tmp/$s/tasks.json"
}
