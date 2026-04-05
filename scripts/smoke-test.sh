#!/usr/bin/env bash
# Smoke test for the Docker-based display stack.
#
# Starts the full docker-compose stack, verifies MagicMirror is reachable,
# sends a shower update, and confirms both services respond correctly.
# Run manually before deploying — not wired into the regular test suite.
#
# Usage:
#   ./scripts/smoke-test.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo "--- Tearing down stack ---"
  docker compose -f "$REPO_ROOT/docker-compose.yml" down
}
trap cleanup EXIT

echo "--- Building and starting stack ---"
docker compose -f "$REPO_ROOT/docker-compose.yml" up --build -d

echo "--- Waiting for MagicMirror at :8080 ---"
for i in $(seq 1 30); do
  if curl -sf http://localhost:8080 > /dev/null 2>&1; then
    echo "    ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "    TIMEOUT: MagicMirror did not become ready" >&2
    exit 1
  fi
  sleep 2
done

echo "--- Sending shower update ---"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:8080/shower-update \
  -H "Content-Type: application/json" \
  -d '{"mode":"SHOWER","turbidity":25}')

if [ "$HTTP_STATUS" != "200" ]; then
  echo "    FAIL: /shower-update returned $HTTP_STATUS" >&2
  exit 1
fi
echo "    /shower-update returned 200"

echo "--- Verifying eink-service is reachable ---"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:3001/trigger)

if [ "$HTTP_STATUS" != "202" ]; then
  echo "    FAIL: eink-service /trigger returned $HTTP_STATUS" >&2
  exit 1
fi
echo "    eink-service /trigger returned 202"

echo "--- Smoke test passed ---"
