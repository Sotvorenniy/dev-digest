#!/bin/bash
# PreToolUse(Bash) guard for the `plan-verifier` subagent only (wired in its frontmatter).
# Allowlist: test/typecheck runners, read-only git, the onion gate, plain read utilities.
# Everything else is denied. Command chaining and redirects are denied so that an allowed
# prefix cannot smuggle a write.

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

if grep -Eq '[;&|<>`]|\$\(' <<<"$cmd"; then
  decide deny "plan-verifier runs single read-only commands: no chaining, pipes, redirects or substitution."
fi

if grep -Eq '^\s*(\./node_modules/\.bin/(vitest\s+run|tsc\s+--noEmit)|npm\s+(test|run\s+typecheck)|git\s+(diff|status|log|show|ls-files|rev-parse)|\.claude/skills/onion-architecture/scripts/check\.sh|ls|cat|wc|jq)\b' <<<"$cmd"; then
  if grep -Eq '\bgit\s+(diff|log|show)\b.*--output' <<<"$cmd"; then
    decide deny "git --output writes a file."
  fi
  decide allow "Read-only verification command."
fi

decide deny "plan-verifier may only run: vitest run, tsc --noEmit, npm test / npm run typecheck, read-only git, the onion check.sh gate, ls, cat, wc, jq. Report anything else as not verified."
