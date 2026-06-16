#!/usr/bin/env bash
# Install and enable the Infinistream display service (run on the display Pi).
#
# Copies infinistream-display.service to /etc/systemd/system/, enables it to
# start on boot, and starts it immediately.
#
# Usage (from repo root):
#   sudo ./scripts/install-display.sh

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "error: must be run as root (use sudo)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE=infinistream-display.service

echo "--- Installing $SERVICE ---"
cp "$REPO_ROOT/$SERVICE" /etc/systemd/system/

echo "--- Reloading systemd ---"
systemctl daemon-reload

echo "--- Enabling $SERVICE ---"
systemctl enable "$SERVICE"

echo "--- Starting $SERVICE ---"
systemctl start "$SERVICE"

echo "--- Status ---"
systemctl status "$SERVICE" --no-pager
