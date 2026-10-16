#!/usr/bin/env bash
# One verification call for the agents that write code (implementer, test-writer) and the
# plan-verifier. Per package: typecheck, the tests related to the changed files (vitest
# `related`: changed tests + tests importing changed sources), and the onion gate when
# server/src changed. Prints one PASS/FAIL line per gate and the tail of each failure only.
#
# Usage: .claude/scripts/check-changed.sh <pkg>... [--full] [--it]
#   <pkg>   server | client | reviewer-core | e2e | mcp
#   --full  run the whole package suite instead of the related tests (end of a phase)
#   --it    server only: include *.it.test.ts (needs Docker; they self-skip without it)
# Changed = everything since merge-base with origin/main (CHECK_BASE=<ref> overrides),
# committed or not, plus untracked files. Exit code = number of failed gates.
set -uo pipefail
set -f  # changed paths such as client/src/app/repos/[repoId] must not glob-expand

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
full=0 it=0 pkgs=()
for a in "$@"; do
  case "$a" in
    --full) full=1 ;;
    --it) it=1 ;;
    server|client|reviewer-core|e2e|mcp) pkgs+=("$a") ;;
    *) echo "unknown argument: $a" >&2; exit 64 ;;
  esac
done
[[ ${#pkgs[@]} -eq 0 ]] && { echo "usage: $0 <server|client|reviewer-core|e2e|mcp>... [--full] [--it]" >&2; exit 64; }

base=$(git -C "$ROOT" merge-base "${CHECK_BASE:-origin/main}" HEAD 2>/dev/null || git -C "$ROOT" rev-parse HEAD)
export DEBUG_PRINT_LIMIT=1500 NO_COLOR=1 FORCE_COLOR=0
log=$(mktemp); trap 'rm -f "$log"' EXIT
fails=0

# check.sh reports 8 repo-intel/_shared no-circular cycles that the depcruise baseline no
# longer matches (pre-existing; see architecture-reviewer Step 2). Anything else fails.
KNOWN_CYCLES=8
known_cycles_only() {
  grep -q 'no new container.db access' "$log" &&
    grep -Eq "x $KNOWN_CYCLES dependency violations \($KNOWN_CYCLES errors" "$log" &&
    [[ $(grep -Ec '^\s*error ' "$log") -eq $KNOWN_CYCLES ]] &&
    [[ $(grep -Ec '^\s*error no-circular: src/modules/(repo-intel|_shared)/' "$log") -eq $KNOWN_CYCLES ]]
}

gate() { # gate <label> <dir> <cmd...>
  local label=$1 dir=$2; shift 2
  (cd "$dir" && "$@") >"$log" 2>&1
  local rc=$?
  if [[ $rc -eq 0 ]]; then
    echo "PASS $label$(grep -Eo 'Tests +[0-9]+ passed[^)]*\)?' "$log" | tail -1 | sed 's/^/ — /')"
  elif [[ $label == *onion* ]] && known_cycles_only; then
    echo "PASS $label — only the $KNOWN_CYCLES known repo-intel no-circular errors (pre-existing baseline drift, not new)"
  else
    fails=$((fails + 1))
    echo "FAIL $label (exit $rc) — last lines:"
    sed -E 's/\x1b\[[0-9;]*m//g' "$log" | grep -v '^\s*$' | tail -60 | sed 's/^/  /'
  fi
}

for pkg in "${pkgs[@]}"; do
  dir="$ROOT/$pkg"
  if [[ ! -x "$dir/node_modules/.bin/tsc" ]]; then
    echo "FAIL $pkg — node_modules missing (see AGENTS.md install row; pnpm is broken, npm ci for npm packages)"
    fails=$((fails + 1)); continue
  fi
  if [[ $pkg == server && ! -d "$ROOT/reviewer-core/node_modules" ]]; then
    echo "FAIL server — reviewer-core deps missing: run 'npm ci' in reviewer-core/ (server type-checks its raw source)"
    fails=$((fails + 1)); continue
  fi

  changed=$( { git -C "$ROOT" diff --name-only --diff-filter=d "$base" -- "$pkg";
               git -C "$ROOT" ls-files --others --exclude-standard -- "$pkg"; } \
             | grep -E '\.(ts|tsx|mts|cts|js|mjs|json)$' | grep -v "^$pkg/clones/" | sed "s#^$pkg/##" | sort -u)

  if [[ $pkg == client ]]; then gate "$pkg typecheck" "$dir" ./node_modules/.bin/tsc --noEmit
  else gate "$pkg typecheck" "$dir" ./node_modules/.bin/tsc --noEmit -p tsconfig.json; fi

  if [[ $pkg == e2e ]]; then
    echo "SKIP e2e flows — they need the running stack: run ./scripts/e2e.sh or the named flows"
  else
    excl=() ; [[ $pkg == server && $it -eq 0 ]] && excl=(--exclude '**/*.it.test.ts')
    vflags=(--reporter=dot --silent --passWithNoTests ${excl[@]+"${excl[@]}"})
    if [[ $full -eq 1 ]]; then
      gate "$pkg tests (full suite)" "$dir" ./node_modules/.bin/vitest run "${vflags[@]}"
    elif [[ -z $changed ]]; then
      echo "SKIP $pkg tests — no changed source files since $base"
    else
      # shellcheck disable=SC2086
      gate "$pkg tests (related to $(wc -l <<<"$changed" | tr -d ' ') changed files)" "$dir" \
        ./node_modules/.bin/vitest related $changed --run "${vflags[@]}"
    fi
  fi

  if [[ $pkg == server ]] && grep -Eq '^src/' <<<"$changed" && grep -Ev '^src/vendor/' <<<"$changed" | grep -q '^src/'; then
    gate "server onion gate (check.sh)" "$ROOT" bash "$ROOT/.claude/skills/onion-architecture/scripts/check.sh"
  fi
done

[[ $it -eq 1 ]] && ! docker info >/dev/null 2>&1 && echo "NOTE Docker is not running: *.it.test.ts self-skipped — report them as skipped, not passed"
exit "$fails"
