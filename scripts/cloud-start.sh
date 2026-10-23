#!/usr/bin/env bash
# Cloud agent boot: keep the dev server running in a tmux session.
# Safe to rerun; logs go to /tmp/swingbus-dev.log.
set -uo pipefail
cd "$(dirname "$0")/.."

SESSION=swingbus-dev
PORT=43127

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -c "$PWD" \
    "./scripts/dev-forever.sh 2>&1 | tee -a /tmp/swingbus-dev.log"
fi

for _ in $(seq 1 90); do
  if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/"; then
    echo "swingbus dev server is up on :$PORT"
    exit 0
  fi
  sleep 1
done
echo "swingbus dev server did not answer on :$PORT after 90s; see /tmp/swingbus-dev.log" >&2
exit 1
