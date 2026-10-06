#!/bin/bash
# PreToolUse(Edit|Write) guard for the `test-writer` subagent only (wired in its frontmatter).
# allow -> test files and test helpers
# deny  -> everything else (production code, config, docs, vendor, migrations, plans)

input=$(cat)
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
root=$(jq -r '.cwd // ""' <<<"$input")
rel="${path#"$root"/}"

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

case "$rel" in
  *..*) decide deny "Path traversal is not allowed." ;;
  server/test/*|client/src/test/*|client/src/*.test.ts|client/src/*.test.tsx|reviewer-core/*.test.ts|reviewer-core/test/*|e2e/specs/*.flow.json)
    decide allow "test-writer may edit test files." ;;
esac

decide deny "test-writer edits tests only ($rel is not a test file). Report the needed source change as a blocker."
