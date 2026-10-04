#!/bin/bash
# PreToolUse(Edit|Write) guard for the `doc-writer` subagent only (wired in its frontmatter).
# allow -> docs/ folders (root and per package) and specs/ folders
# deny  -> everything else, including AGENTS.md, CLAUDE.md, INSIGHTS.md and README.md outside docs/

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
  docs/*|server/docs/*|client/docs/*|reviewer-core/docs/*|e2e/docs/*|specs/*|server/specs/*|client/specs/*|reviewer-core/specs/*|e2e/specs/*.md)
    decide allow "doc-writer may edit docs and specs." ;;
esac

decide deny "doc-writer writes under docs/ and specs/ only ($rel is outside). Suggest the change in the report instead."
