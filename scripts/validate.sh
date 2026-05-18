#!/bin/bash
set -e

BAIL=0
for arg in "$@"; do
  if [ "$arg" = "--bail" ]; then
    BAIL=1
  fi
done

echo "==> typecheck"
bun run typecheck

echo "==> lint"
bun run lint

echo "==> test"
if [ "$BAIL" -eq 1 ]; then
  bun run --filter '*' test -- --bail
else
  bun run --filter '*' test
fi
