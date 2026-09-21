#!/usr/bin/env bash
# Run a poa-app Yarn command under the repository's exact Node/Yarn toolchain.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
exec bash "$REPO_ROOT/scripts/with-node22.sh" corepack yarn --cwd "$REPO_ROOT/poa-app" "$@"
