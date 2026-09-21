#!/usr/bin/env bash
# Reproducible, non-interactive workspace bootstrap for Conductor and local use.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE_RUNNER="$REPO_ROOT/scripts/with-node22.sh"
EXPECTED_NODE="v22.23.2"
EXPECTED_YARN="1.22.22"
EXPECTED_SMITHERS="0.32.0"

check_environment() {
  local node_version yarn_version smithers_version
  node_version="$(bash "$NODE_RUNNER" node --version)"
  [ "$node_version" = "$EXPECTED_NODE" ] || {
    echo "setup: expected Node $EXPECTED_NODE, got $node_version" >&2
    return 1
  }

  yarn_version="$(bash "$NODE_RUNNER" corepack yarn --version)"
  [ "$yarn_version" = "$EXPECTED_YARN" ] || {
    echo "setup: expected Yarn $EXPECTED_YARN, got $yarn_version" >&2
    return 1
  }

  command -v bun >/dev/null 2>&1 || {
    echo "setup: Bun >=1.3.0 is required for the Smithers workflow." >&2
    return 1
  }
  bun -e 'const [major, minor] = Bun.version.split(".").map(Number); process.exit(major > 1 || (major === 1 && minor >= 3) ? 0 : 1)' || {
    echo "setup: Bun >=1.3.0 is required; found $(bun --version)." >&2
    return 1
  }

  [ -x "$REPO_ROOT/poa-app/node_modules/.bin/next" ] || {
    echo "setup: poa-app dependencies are missing; run bash .conductor/setup.sh" >&2
    return 1
  }
  (cd "$REPO_ROOT/poa-app" && bash "$NODE_RUNNER" node -e 'require.resolve("gray-matter")') >/dev/null 2>&1 || {
    echo "setup: poa-app dependency gray-matter is unavailable." >&2
    return 1
  }
  [ -x "$REPO_ROOT/.smithers/node_modules/.bin/smithers" ] || {
    echo "setup: Smithers dependencies are missing; run bash .conductor/setup.sh" >&2
    return 1
  }
  smithers_version="$(cd "$REPO_ROOT/.smithers" && ./node_modules/.bin/smithers --version)"
  [ "$smithers_version" = "$EXPECTED_SMITHERS" ] || {
    echo "setup: expected Smithers $EXPECTED_SMITHERS, got $smithers_version" >&2
    return 1
  }

  echo "setup: ready (Node ${node_version#v}, Yarn $yarn_version, Bun $(bun --version), Smithers $smithers_version)"
}

if [ "${1:-}" = "--check" ]; then
  check_environment
  exit
fi

if ! bash "$NODE_RUNNER" node --version >/dev/null 2>&1; then
  if command -v mise >/dev/null 2>&1; then
    mise install node@22.23.2
  elif [ -s "${HOME}/.nvm/nvm.sh" ]; then
    # nvm is a shell function, so setup must source it explicitly in this
    # non-interactive shell rather than relying on a user's dotfiles.
    # shellcheck disable=SC1091
    . "${HOME}/.nvm/nvm.sh"
    nvm install 22.23.2
  elif command -v volta >/dev/null 2>&1; then
    volta install node@22.23.2
  else
    echo "setup: install mise, nvm, or Volta so Node 22.23.2 can be installed." >&2
    exit 1
  fi
fi

bash "$NODE_RUNNER" corepack yarn --cwd "$REPO_ROOT/poa-app" install --frozen-lockfile
(cd "$REPO_ROOT/.smithers" && bun install --frozen-lockfile)
check_environment
