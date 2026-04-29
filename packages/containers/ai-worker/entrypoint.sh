#!/bin/sh
set -eu

OPENCODE_HOME_DIR="${HOME:-/home/node}"
OPENCODE_DATA_DIR="$OPENCODE_HOME_DIR/.local/share/opencode"
OPENCODE_STATE_DIR="$OPENCODE_HOME_DIR/.local/state"

mkdir -p "$OPENCODE_DATA_DIR" "$OPENCODE_STATE_DIR"

if [ -f /opencode-host-share/auth.json ]; then
	cp /opencode-host-share/auth.json "$OPENCODE_DATA_DIR/auth.json"
	chmod 600 "$OPENCODE_DATA_DIR/auth.json"
fi

exec "$@"
