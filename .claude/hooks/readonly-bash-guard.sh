#!/bin/bash
# PreToolUse(Bash) guard for the `plan-verifier` subagent only (wired in its frontmatter).
# Allowlist: test/typecheck runners, read-only git, the onion gate, the agent check scripts,
# plain read utilities. Everything else is denied. Command chaining and redirects are denied
# so that an allowed prefix cannot smuggle a write; quoted arguments (a jq filter with `|`,
# a `git grep -e 'a|b'` pattern) are not chaining and are allowed.

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

# Walk the command the way the shell quotes it. `unquoted` keeps only characters outside
# quotes; `live` also keeps double-quoted ones, where `$(` and backticks still run.
unquoted='' live='' state=none
for ((i = 0; i < ${#cmd}; i++)); do
  c=${cmd:i:1}
  case $state in
    single) [[ $c == "'" ]] && state=none ;;
    double)
      if [[ $c == '\' ]]; then ((i++)); live+='_'
      elif [[ $c == '"' ]]; then state=none
      else live+=$c; fi ;;
    none)
      if [[ $c == '\' ]]; then ((i++)); unquoted+='_'; live+='_'
      elif [[ $c == "'" ]]; then state=single
      elif [[ $c == '"' ]]; then state=double
      else unquoted+=$c; live+=$c; fi ;;
  esac
done
if [[ $state != none ]]; then
  decide deny "plan-verifier runs single read-only commands: unbalanced quotes."
fi
if grep -Eq '`|\$\(' <<<"$live"; then
  decide deny "plan-verifier runs single read-only commands: no command substitution."
fi
if grep -Eq '[;&|<>]' <<<"$unquoted" || [[ $unquoted == *$'\n'* ]]; then
  decide deny "plan-verifier runs single read-only commands: no chaining, pipes, redirects or unbalanced quotes. Use 'git -C <dir>' or 'npm --prefix <dir>' instead of 'cd <dir> &&'."
fi

pkg='(server|client|reviewer-core|e2e|mcp)'
bin="(\./|(/[^ ]+/)?${pkg}/)node_modules/\.bin/(vitest\s+(run|related)|tsc\s+--noEmit)"
npm="npm\s+((--prefix|-C)\s+\S+\s+)?(test|run\s+typecheck)"
git_ro='git\s+(-C\s+\S+\s+)?(diff|status|log|show|ls-files|rev-parse|grep|merge-base)'
scripts='(\S*/)?\.claude/(skills/onion-architecture/scripts/check\.sh|scripts/check-changed\.sh)'

if grep -Eq "^\s*(${bin}|${npm}|${git_ro}|${scripts}|cd|ls|cat|wc|jq|head|tail)\b" <<<"$cmd"; then
  if grep -Eq '\bgit\b.*\s--output\b' <<<"$cmd"; then
    decide deny "git --output writes a file."
  fi
  if grep -Eq '\bgit\s+(-C\s+\S+\s+)?grep\b.*\s(-O|--open-files-in-pager)\b' <<<"$cmd"; then
    decide deny "git grep -O runs a pager command."
  fi
  if grep -Eq '\bvitest\b.*\s(-u|--update|--watch)\b' <<<"$cmd"; then
    decide deny "vitest -u rewrites snapshots; --watch never ends."
  fi
  decide allow "Read-only verification command."
fi

decide deny "plan-verifier may only run: vitest run/related, tsc --noEmit, npm [--prefix <dir>] test / run typecheck, read-only git (also with -C <dir>, git grep), check.sh, check-changed.sh, cd, ls, cat, wc, jq, head, tail. Report anything else as not verified."
