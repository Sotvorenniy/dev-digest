#!/usr/bin/env bash
# Publishes the verdict as the GitHub commit status `pr-self-review` on HEAD.
# Make that context a required check on main and a PR cannot merge without a PASS.
#   publish-status.sh          → publish now
#   publish-status.sh --hook   → Claude Code PostToolUse hook; publishes only after
#                                `git push` / `gh pr create`, never fails the call
#
# `success` is only sent when the working tree is clean and the verdict matches
# it — then HEAD's tree is exactly the reviewed code. The status is set from a
# local machine, so this is team discipline, not protection against bypass.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CONTEXT="pr-self-review"

if [[ "${1:-}" == "--hook" ]]; then
  cmd="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')"
  grep -Eq '(^|[;&|(`])[[:space:]]*(gh[[:space:]]+pr[[:space:]]+create|git[[:space:]]+push)([[:space:]]|$)' <<<"$cmd" || exit 0
  "$0" >&2 || true
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "publish-status: gh CLI not installed — GitHub status not published (the required check keeps the PR unmergeable)." >&2
  exit 1
fi

result="$(node "$DIR/verdict.mjs" check)"
field() { node -e 'const v=JSON.parse(process.argv[1]);const x=v[process.argv[2]];process.stdout.write(x&&typeof x==="object"?JSON.stringify(x):String(x??""))' "$result" "$1"; }
status="$(field status)"
head="$(field head)"
dirty="$(field dirty)"
critical="$(node -e 'process.stdout.write(String(JSON.parse(process.argv[1]).counts?.CRITICAL??0))' "$result")"

case "$status" in
  PASS)
    if [[ "$dirty" == "true" ]]; then
      echo "publish-status: uncommitted changes — HEAD is not what was reviewed; commit, push and publish again." >&2
      exit 1
    fi
    state=success; desc="No critical findings" ;;
  BLOCKED)    state=failure; desc="$critical critical finding(s)" ;;
  INCOMPLETE) state=failure; desc="Some gates could not run" ;;
  *)
    echo "publish-status: verdict is $status for the current changes — run /pr-self-review first." >&2
    exit 1 ;;
esac

remote="$(git -C "$DIR" remote get-url "${PR_SELF_REVIEW_REMOTE:-origin}")"
repo="$(sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##' <<<"$remote")"

if gh api "repos/$repo/statuses/$head" -f state="$state" -f context="$CONTEXT" -f description="$desc" >/dev/null; then
  echo "publish-status: $CONTEXT=$state on $repo@${head:0:8}" >&2
else
  echo "publish-status: could not publish (is HEAD pushed to $repo?)" >&2
  exit 1
fi
