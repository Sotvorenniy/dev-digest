#!/usr/bin/env bash
# Points git at the tracked hooks in scripts/githooks (pre-push → PR self-review gate).
set -euo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
git -C "$ROOT" config core.hooksPath scripts/githooks
chmod +x "$ROOT"/scripts/githooks/*
echo "git hooks installed: core.hooksPath=scripts/githooks"
