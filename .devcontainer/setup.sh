#!/usr/bin/env bash
set -euo pipefail

# Chromium for headless browser use (no desktop environment needed)
sudo apt-get update -qq && sudo apt-get install -y --no-install-recommends chromium

# Python deps for controller (spidev and RPi.GPIO are Pi-only hardware
# packages; config.py falls back to MockHardware automatically on non-Pi)
pip install --quiet \
    click requests devantech-eth \
    pytest pytest-bdd \
    Pillow

# Node deps for eink-service
(cd eink-service && npm install --silent)

# Node deps for MMM-Infinistream
(cd MMM-Infinistream && npm install --silent)
