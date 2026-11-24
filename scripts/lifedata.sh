#!/bin/bash
# What launchd runs at 04:05: yesterday's block into "Life data/Gym-bro.md",
# plus a re-check of the 7 days before it in case data arrived late.
#
# launchd gives a job almost no environment, so neither `node` nor the repo's
# directory can be assumed — both are worked out here.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

NODE="$(command -v node 2>/dev/null || true)"
if [ -z "$NODE" ]; then
  for candidate in \
    /opt/homebrew/opt/node@20/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node; do
    if [ -x "$candidate" ]; then NODE="$candidate"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  echo "[lifedata] $(date '+%Y-%m-%d %H:%M:%S') no node found — nothing written"
  exit 1
fi

echo "[lifedata] $(date '+%Y-%m-%d %H:%M:%S') run"
exec "$NODE" "$REPO/scripts/lifedata.mjs" "$@"
