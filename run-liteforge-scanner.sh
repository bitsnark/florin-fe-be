#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TS_NODE="$SCRIPT_DIR/node_modules/.bin/ts-node"

cd "$SCRIPT_DIR"
exec "$TS_NODE" src/liteforge-scanner.ts
