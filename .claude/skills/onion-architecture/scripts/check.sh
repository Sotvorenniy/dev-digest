#!/usr/bin/env bash
# Onion Architecture gate for server/. Exit 0 = no NEW violations.
#   1. dependency-cruiser with the frozen baseline (--ignore-known)
#   2. a grep for `container.db` outside repositories/composition root, which
#      dependency-cruiser cannot see (it is property access, not an import)
# Usage: .claude/skills/onion-architecture/scripts/check.sh   (from anywhere)
set -uo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
SERVER="$ROOT/server"
cd "$SERVER" || exit 2

DEPCRUISE=./node_modules/.bin/depcruise
if [[ ! -x "$DEPCRUISE" ]]; then
  echo "dependency-cruiser not installed — run the server install first (see AGENTS.md: pnpm is broken, use ./node_modules/.bin/*)" >&2
  exit 2
fi

status=0

echo "── dependency-cruiser (baseline: .dependency-cruiser-known-violations.json)"
"$DEPCRUISE" src --config .dependency-cruiser.cjs --ignore-known --output-type err || status=1

# Files that used container.db before the skill existed. Remove a line when you
# fix that file; never add one.
KNOWN_CONTAINER_DB=(
  src/modules/agents/service.ts
  src/modules/polling/routes.ts
  src/modules/pulls/routes.ts
  src/modules/repo-intel/service.ts
  src/modules/repos/service.ts
  src/modules/reviews/service.ts
  src/modules/settings/feature-models.ts
  src/modules/settings/routes.ts
  src/modules/workspace/routes.ts
)

echo "── container.db outside repositories"
new_hits=()
while IFS= read -r f; do
  case "$f" in
    */repository.ts|*/repository/*|*.repo.ts) continue ;;
  esac
  known=0
  for k in "${KNOWN_CONTAINER_DB[@]}"; do [[ "$f" == "$k" ]] && known=1 && break; done
  [[ $known -eq 0 ]] && new_hits+=("$f")
done < <(grep -rlE 'container\.db\b' src/modules 2>/dev/null | sort)

if (( ${#new_hits[@]} )); then
  status=1
  for f in "${new_hits[@]}"; do
    grep -nE 'container\.db\b' "$f" | sed "s|^|  error container-db-outside-repository: $f:|"
  done
else
  echo "✔ no new container.db access"
fi

exit $status
