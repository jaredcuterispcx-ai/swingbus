#!/usr/bin/env bash
# Expose swingbus from an xAI Tailscale host to personal phones (no Tailscale on phone).
# Requires: Tailscale admin has Funnel enabled; MagicDNS + HTTPS on.
set -euo pipefail

PORT="${1:-43127}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found. Install Tailscale on this host first." >&2
  exit 1
fi

echo "Starting Funnel on port ${PORT}…"
echo "Personal phones use the printed https://….ts.net URL — no Tailscale app required."
echo "Corp-only alternative: tailscale serve ${PORT}"
exec tailscale funnel "${PORT}"
