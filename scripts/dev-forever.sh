#!/usr/bin/env bash
# Keep the dev server up: restart it whenever it exits.
# To bounce the server without stopping this loop: pkill -f next-server
cd "$(dirname "$0")/.." || exit 1
while true; do
  npm run dev
  echo "[swing-bus] dev server exited ($?), restarting in 2s"
  sleep 2
done
