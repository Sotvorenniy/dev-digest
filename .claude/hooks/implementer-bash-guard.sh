#!/bin/bash
# PreToolUse(Bash) guard for the `implementer` and `test-writer` subagents (wired in their frontmatter).
# deny  -> destructive / publishing / broken commands
# ask   -> npm install-style commands in server/ or client/ (pnpm is authoritative there)
# allow -> npm ci / npm install in reviewer-core/ or e2e/ (npm packages)
# otherwise no decision: normal permission flow.

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
cwd=$(jq -r '.cwd // ""' <<<"$input")

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

# --- deny ---
if grep -Eq '(^|[;&|(]|\s)docker[ -]compose\s+down\b.*(\s-v\b|\s--volumes\b)' <<<"$cmd"; then
  decide deny "docker compose down -v drops the devdigest_pgdata volume (every imported repo and review). Never run it."
fi
if grep -Eq '(^|[;&|(]\s*)git\s+(commit|push)\b' <<<"$cmd"; then
  decide deny "Subagents do not commit or push. Report the changed files; the user commits after review."
fi
if grep -Eq '(^|[;&|(]\s*)rm\s+(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)\b' <<<"$cmd"; then
  decide deny "Recursive rm is not allowed for subagents. Report it as a blocker if a deletion is needed."
fi
if grep -Eq '(^|[;&|(]\s*)(pnpm|corepack)\b' <<<"$cmd"; then
  decide deny "pnpm/corepack is broken in this environment. Use ./node_modules/.bin/<bin> (vitest run, tsc --noEmit, next build, tsx ..., drizzle-kit ...)."
fi

# --- npm install-style commands ---
if grep -Eq '(^|[;&|(]\s*)npm\s+(i|install|add|update|uninstall|rm)\b' <<<"$cmd"; then
  target="$cwd $cmd"
  if grep -Eq '(/|\s|=)(server|client)(/|\s|$)' <<<"$target"; then
    decide ask "npm install in server/ or client/: pnpm is authoritative there (CI reads pnpm-lock.yaml) and pnpm is broken here. Approve only if intended."
  fi
  if grep -Eq '(/|\s|=)(reviewer-core|e2e)(/|\s|$)' <<<"$target"; then
    decide allow "npm is the package manager of reviewer-core and e2e."
  fi
  decide ask "npm install outside a known npm package (reviewer-core, e2e). Confirm the target directory."
fi
if grep -Eq '(^|[;&|(]\s*)npm\s+ci\b' <<<"$cmd"; then
  if grep -Eq '(/|\s|=)(server|client)(/|\s|$)' <<<"$cwd $cmd"; then
    decide ask "npm ci in server/ or client/: these use pnpm. Approve only if intended."
  fi
  decide allow "npm ci is the documented install for reviewer-core and e2e."
fi

exit 0
