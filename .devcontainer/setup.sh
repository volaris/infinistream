#!/usr/bin/env bash
set -euo pipefail

# Chromium for headless browser use (no desktop environment needed)
sudo apt-get update -qq && sudo apt-get install -y --no-install-recommends chromium

# Install controller package + dev deps in editable mode
# (spidev and RPi.GPIO are Pi-only; config.py falls back to MockHardware automatically)
uv pip install --quiet -e "/workspaces/infinistream[dev]"

# Node deps for eink-service
(cd eink-service && npm install --silent)

# Node deps for MMM-Infinistream
(cd MMM-Infinistream && npm install --silent)
