#!/usr/bin/env bash
# Find INSIGHTS.md entries related to a candidate, so a near-duplicate is never
# appended. Searches the package file and the root file, and reports which entry
# each match belongs to.
#
#   find-related.sh <pkg> "<key terms>"
#
#   <pkg>        root | server | client | reviewer-core | e2e
#   <key terms>  space-separated; a match on ANY term is reported
#
# Exit codes: 0 no matches (safe to add) · 1 matches found (judge before adding)
#             2 bad usage. A missing INSIGHTS.md is reported, not fatal —
#             an absent file simply has nothing to duplicate.

set -uo pipefail

usage() {
  echo "usage: find-related.sh <root|server|client|reviewer-core|e2e> \"<key terms>\"" >&2
  exit 2
}

[ $# -eq 2 ] || usage

pkg=$1
terms=$2

case "$pkg" in
  root|server|client|reviewer-core|e2e) ;;
  *) echo "unknown package: $pkg" >&2; usage ;;
esac

[ -n "${terms// /}" ] || { echo "no key terms given" >&2; usage; }

# Resolve the repo root from this script's location so the caller's cwd is
# irrelevant: <root>/.claude/skills/engineering-insights/scripts/ -> <root>
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/../../../.." && pwd)

files=("$repo_root/INSIGHTS.md")
[ "$pkg" != "root" ] && files+=("$repo_root/$pkg/INSIGHTS.md")

# Build a case-insensitive alternation from the terms.
pattern=$(printf '%s' "$terms" | tr -s ' ' '|')

found=0

for file in "${files[@]}"; do
  rel=${file#"$repo_root"/}

  if [ ! -f "$file" ]; then
    echo "-- $rel: not found (nothing to duplicate)"
    continue
  fi

  matches=$(
    awk -v pat="$pattern" '
      /^## /  { section = substr($0, 4); entry = ""; next }
      /^### / { entry   = substr($0, 5);             next }
      tolower($0) ~ tolower(pat) {
        printf "%d\t%s\t%s\t%s\n", NR, (section == "" ? "-" : section),
               (entry == "" ? "(no entry — file preamble)" : entry), $0
      }
    ' "$file"
  )

  if [ -z "$matches" ]; then
    echo "-- $rel: no related entries"
    continue
  fi

  found=1
  echo "-- $rel: related entries found"
  # Report each owning entry once, with the first matching line as the reason.
  printf '%s\n' "$matches" | awk -F'\t' '
    !seen[$3]++ {
      printf "   %s:%s\n", $2, $3
      printf "     line %s: %s\n", $1, substr($4, 1, 100)
    }
  '
done

if [ "$found" -eq 1 ]; then
  echo
  echo "Related entries exist. Enrich one, correct one, or drop the candidate."
  echo "Do NOT append a near-duplicate, and do NOT remove what is already there."
  exit 1
fi

echo
echo "No related entries. Safe to add under the fitting section."
exit 0