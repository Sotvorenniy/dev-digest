#!/usr/bin/env bash
# Enforce the one invariant: an existing insight is never removed.
#
#   verify-append-only.sh snapshot <file>   # before editing
#   verify-append-only.sh check    <file>   # after editing
#
# `check` fails when the edit deleted any line, dropped any heading, or shrank
# the file — and RESTORES the file from the snapshot before reporting.
#
# It restores from the snapshot rather than from git on purpose: the developer
# may have their own uncommitted edits in that file, and `git checkout --` would
# destroy those too. The snapshot restores the pre-edit state and nothing else.
#
# Exit codes: 0 clean · 1 violation (file restored) · 2 bad usage or no snapshot.

set -uo pipefail

snap_dir="${TMPDIR:-/tmp}/engineering-insights-snapshots"

usage() {
  echo "usage: verify-append-only.sh <snapshot|check> <file>" >&2
  exit 2
}

[ $# -eq 2 ] || usage

mode=$1
file=$2

case "$mode" in snapshot|check) ;; *) usage ;; esac

if [ ! -f "$file" ]; then
  echo "no such file: $file" >&2
  exit 2
fi

abs=$(cd -- "$(dirname -- "$file")" && pwd)/$(basename -- "$file")
key=$(printf '%s' "$abs" | tr '/ ' '__')
snap="$snap_dir/$key"

if [ "$mode" = snapshot ]; then
  mkdir -p "$snap_dir" || exit 2
  cp -- "$file" "$snap" || exit 2
  echo "snapshot taken: $(wc -l < "$snap" | tr -d ' ') lines"
  exit 0
fi

# --- check -------------------------------------------------------------------

if [ ! -f "$snap" ]; then
  echo "NO SNAPSHOT for $file" >&2
  echo "Take one before editing: verify-append-only.sh snapshot $file" >&2
  exit 2
fi

violations=()

before_lines=$(wc -l < "$snap" | tr -d ' ')
after_lines=$(wc -l < "$file" | tr -d ' ')

# Any '-' line in a unified diff is content that existed and no longer does.
deleted=$(diff -u -- "$snap" "$file" 2>/dev/null \
  | grep -c '^-[^-]' || true)
deleted=${deleted:-0}

[ "$deleted" -gt 0 ] && violations+=("$deleted line(s) deleted or modified in place")
[ "$after_lines" -lt "$before_lines" ] &&
  violations+=("file shrank: $before_lines -> $after_lines lines")

# Every heading that existed must still exist, byte for byte.
missing=0
while IFS= read -r heading; do
  [ -n "$heading" ] || continue
  if ! grep -Fxq -- "$heading" "$file"; then
    violations+=("heading removed: $heading")
    missing=$((missing + 1))
  fi
done < <(grep -E '^#{2,3} ' -- "$snap" || true)

if [ ${#violations[@]} -gt 0 ]; then
  cp -- "$snap" "$file"
  echo "APPEND-ONLY VIOLATION — $file has been restored from the snapshot." >&2
  for v in "${violations[@]}"; do
    echo "  - $v" >&2
  done
  echo >&2
  echo "Permitted operations: append a new entry, append lines to an existing" >&2
  echo "entry, append a dated correction, append a missing section heading." >&2
  echo "Nothing already written may be deleted, reworded or reordered." >&2
  exit 1
fi

added=$((after_lines - before_lines))
echo "append-only check passed: +$added line(s), 0 deleted, $missing heading(s) lost"
exit 0