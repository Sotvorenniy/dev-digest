#!/bin/bash
# PreToolUse(Edit|Write) guard for the `spec-creator` agent only (wired in its frontmatter).
# allow -> a Markdown spec file directly inside root specs/ or <pkg>/specs/ (README.md excluded)
# deny  -> everything else, including e2e/specs/ (runner input), spec-folder READMEs, docs/, code and .claude/

input=$(cat)
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
cwd=$(jq -r '.cwd // ""' <<<"$input")
# Resolve against the repo root, not the session cwd: a subagent launched while the
# main session sits in server/ would otherwise see every path as outside its allow-list.
root="${CLAUDE_PROJECT_DIR:-$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$cwd")}"
rel="${path#"$root"/}"

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

case "$rel" in
  *..*) decide deny "Path traversal is not allowed." ;;
  */README.md|README.md) decide deny "spec-creator does not edit spec-folder READMEs. Put the index line in the Spec Report hand-off." ;;
  specs/*/*|server/specs/*/*|client/specs/*/*|reviewer-core/specs/*/*|mcp/specs/*/*)
    decide deny "spec-creator writes spec files directly inside a specs/ folder, not in subfolders ($rel)." ;;
  specs/*.md|server/specs/*.md|client/specs/*.md|reviewer-core/specs/*.md|mcp/specs/*.md)
    decide allow "spec-creator may write a spec file." ;;
esac

decide deny "spec-creator writes only spec files in specs/ or <pkg>/specs/ ($rel is outside). Suggest the change in the Spec Report hand-off instead."
