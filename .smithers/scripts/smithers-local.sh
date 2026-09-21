#!/usr/bin/env bash
# Always use the repository-pinned Smithers release. This avoids bunx resolving a
# newer package at runtime and makes local, CI, and Conductor behavior identical.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
SMITHERS_BIN="$REPO_ROOT/.smithers/node_modules/.bin/smithers"

if [ ! -x "$SMITHERS_BIN" ]; then
  echo "smithers-local: dependencies are missing; run bash .conductor/setup.sh" >&2
  exit 1
fi

cd "$REPO_ROOT"
exec "$SMITHERS_BIN" "$@"
