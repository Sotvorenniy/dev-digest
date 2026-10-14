#!/bin/bash
# PreToolUse(Edit|Write) guard for the `implementation-planner` subagent only (wired in its
# frontmatter). allow -> one plan file directly in .claude/plans/; deny -> everything else.

input=$(cat)
path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
cwd=$(jq -r '.cwd // ""' <<<"$input")
# Resolve against the repo root, not the session cwd: a subagent launched while the
# main session sits in server/ would otherwise see every path as outside its allow-list.
root="${CLAUDE_PROJECT_DIR:-$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$cwd")}"
rel="${path#"${CLAUDE_PROJECT_DIR:-$root}"/}"

decide() {
  jq -n --arg d "$1" --arg r "$2" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

case "$rel" in
  *..*) decide deny "Path traversal is not allowed." ;;
  .claude/plans/*/*) ;;
  .claude/plans/*.md) decide allow "implementation-planner writes its plan file." ;;
esac

decide deny "implementation-planner writes only .claude/plans/<task-slug>.md ($rel is not one). Specs belong to spec-creator; code to implementer."
