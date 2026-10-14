#!/bin/bash
# PreToolUse(Edit|Write) guard for the `implementer` subagent only (wired in its frontmatter).
# deny  -> creating a NEW test file (new tests belong to test-writer; editing an existing
#          test that the change broke stays allowed)
# deny  -> do-not-touch paths from AGENTS.md: server/clones, vendored copies (except the
#          paired shared contracts), migrations (drizzle-kit writes them), lockfiles, plans, specs
# otherwise no decision: normal permission flow.

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
root=$(jq -r '.cwd // ""' <<<"$input")
rel="${path#"${CLAUDE_PROJECT_DIR:-$root}"/}"

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

case "$rel" in
  *..*) decide deny "Path traversal is not allowed." ;;
  server/clones/*) decide deny "server/clones/** are runtime git checkouts. Never edit them." ;;
  server/src/vendor/shared/*|client/src/vendor/shared/*) ;; # paired contract change, both copies
  */src/vendor/*) decide deny "Vendored copies are not sources. Report the needed change as a blocker." ;;
  server/src/db/migrations/*) decide deny "Migrations are written by ./node_modules/.bin/drizzle-kit generate, never by hand." ;;
  *pnpm-lock.yaml|*package-lock.json) decide deny "Lockfiles are never edited by agents." ;;
  .claude/plans/*) decide deny "The plan is read-only for the implementer. Report a wrong step as a deviation." ;;
  specs/*|*/specs/*.md) decide deny "Specs belong to spec-creator. Report a spec gap in the Implementation Report." ;;
esac

if [[ $tool == Write && ! -e $path ]]; then
  case "$rel" in
    *.test.ts|*.test.tsx|*.it.test.ts|e2e/specs/*.flow.json)
      decide deny "New tests belong to test-writer (plan §5). Leave the data-<thing> hooks and seams the plan names; list the test under 'Not run / unverified'." ;;
  esac
fi

exit 0
