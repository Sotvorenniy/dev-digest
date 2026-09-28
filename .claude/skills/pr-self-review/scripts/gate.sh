#!/usr/bin/env bash
# PR self-review gate. Blocks when the stored verdict is not a PASS for exactly
# the current local changes (missing, stale, BLOCKED or INCOMPLETE).
#   gate.sh          → used by git pre-push; exit 1 blocks the push
#   gate.sh --hook   → Claude Code PreToolUse hook; reads the tool call on stdin,
#                      acts only on `gh pr create|merge|ready` and `git push`,
#                      exit 2 blocks the call and feeds stderr back to Claude
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK=0
[[ "${1:-}" == "--hook" ]] && HOOK=1

if (( HOOK )); then
  cmd="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')"
  # Only where a shell command starts (line start or after ; & | ( `), so the
  # words inside a quoted string or a grep pattern do not trigger the gate.
  if ! grep -Eq '(^|[;&|(`])[[:space:]]*(gh[[:space:]]+pr[[:space:]]+(create|merge|ready)|git[[:space:]]+push)([[:space:]]|$)' <<<"$cmd"; then
    exit 0
  fi
fi

result="$(node "$DIR/verdict.mjs" check)"
code=$?
(( code == 0 )) && exit 0

status="$(node -e 'try{process.stdout.write(JSON.parse(process.argv[1]).status)}catch{process.stdout.write("ERROR")}' "$result")"
case "$status" in
  MISSING|STALE) why="no PR self-review verdict for the current changes ($status)." ;;
  BLOCKED)       why="the last PR self-review found CRITICAL findings." ;;
  INCOMPLETE)    why="the last PR self-review could not run every gate (INCOMPLETE)." ;;
  *)             why="the verdict could not be checked: $result" ;;
esac

{
  echo "PR self-review gate: blocked — $why"
  if [[ "$status" == BLOCKED || "$status" == INCOMPLETE ]]; then
    node "$DIR/verdict.mjs" report 2>/dev/null | grep -E '^\| CRITICAL|^- \*\*' || true
  fi
  if (( HOOK )); then
    echo "Run the pr-self-review skill (/pr-self-review) and fix every CRITICAL before retrying this command."
  else
    echo "Run /pr-self-review in Claude Code, fix every CRITICAL, then push again."
    echo "(Emergency only: git push --no-verify skips this gate; the GitHub check still blocks the merge.)"
  fi
} >&2

(( HOOK )) && exit 2
exit 1
