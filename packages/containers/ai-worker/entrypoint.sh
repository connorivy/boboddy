#!/bin/sh
set -eu

OPENCODE_HOME_DIR="${HOME:-/home/node}"
OPENCODE_DATA_DIR="$OPENCODE_HOME_DIR/.local/share/opencode"
OPENCODE_STATE_DIR="$OPENCODE_HOME_DIR/.local/state"
RUNTIME_OPENCODE_DIR="/workspace/.opencode"

mkdir -p "$OPENCODE_DATA_DIR" "$OPENCODE_STATE_DIR"

if [ -f /opencode-host-share/auth.json ]; then
	cp /opencode-host-share/auth.json "$OPENCODE_DATA_DIR/auth.json"
	chmod 600 "$OPENCODE_DATA_DIR/auth.json"
fi

cp /opt/boboddy/plugin.js "$RUNTIME_OPENCODE_DIR/plugins/boboddy.js"

if [ -f "$RUNTIME_OPENCODE_DIR/package.json" ]; then
	cd "$RUNTIME_OPENCODE_DIR"
	npm install --no-audit --no-fund --silent
fi

exec "$@"
