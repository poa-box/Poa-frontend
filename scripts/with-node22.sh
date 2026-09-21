#!/usr/bin/env bash
# Run a command with the repository's exact Node runtime, independent of the
# interactive shell that launched it. POA_NODE_BIN may point at an explicit
# Node binary in CI or another managed environment.
set -euo pipefail

EXPECTED_VERSION="v22.23.2"

valid_node() {
  [ -n "${1:-}" ] && [ -x "$1" ] && [ "$("$1" --version 2>/dev/null || true)" = "$EXPECTED_VERSION" ]
}

run_with_node_dir() {
  local node_bin="$1"
  shift
  PATH="$(dirname "$node_bin"):$PATH" exec "$@"
}

if valid_node "${POA_NODE_BIN:-}"; then
  run_with_node_dir "$POA_NODE_BIN" "$@"
fi

NVM_NODE="${HOME}/.nvm/versions/node/v22.23.2/bin/node"
if valid_node "$NVM_NODE"; then
  run_with_node_dir "$NVM_NODE" "$@"
fi

CURRENT_NODE="$(command -v node 2>/dev/null || true)"
if valid_node "$CURRENT_NODE"; then
  run_with_node_dir "$CURRENT_NODE" "$@"
fi

if command -v mise >/dev/null 2>&1; then
  MISE_NODE_DIR="$(mise where node@22.23.2 2>/dev/null || true)"
  if valid_node "$MISE_NODE_DIR/bin/node"; then
    run_with_node_dir "$MISE_NODE_DIR/bin/node" "$@"
  fi
fi

if command -v volta >/dev/null 2>&1; then
  exec volta run --node 22.23.2 -- "$@"
fi

echo "with-node22: Node 22.23.2 is required but was not found." >&2
echo "Run 'bash .conductor/setup.sh' to install or configure the repository toolchain." >&2
exit 1
