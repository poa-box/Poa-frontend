#!/usr/bin/env bash
# Fail before an implementation agent starts when the workspace cannot build or
# run the registered workflow deterministically.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
bash "$REPO_ROOT/.conductor/setup.sh" --check
git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null
echo "preflight: workspace toolchain and dependencies are ready"
