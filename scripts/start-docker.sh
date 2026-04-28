#!/usr/bin/env bash
# =============================================================================
# start-docker.sh — Start VibePrint OS with dynamic camera detection
# =============================================================================
# Usage:
#   ./scripts/start-docker.sh              # Start in production mode
#   ./scripts/start-docker.sh dev          # Start in dev mode (hot-reload)
#   ./scripts/start-docker.sh down         # Stop all containers
#
# Automatically detects all connected /dev/video* devices and passes only the
# ones that actually exist to Docker. If no camera is plugged in, the app
# starts normally and the camera service falls back to mock mode.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-prod}"

# ── Stop / down ──────────────────────────────────────────────────────────────
if [ "$MODE" = "down" ]; then
    echo "Stopping VibePrint OS..."
    docker compose down
    exit 0
fi

# ── Detect video devices ─────────────────────────────────────────────────────
VIDEO_DEVICES=()
if ls /dev/video* >/dev/null 2>&1; then
    for dev in /dev/video*; do
        VIDEO_DEVICES+=("$dev")
    done
fi

echo "──────────────────────────────────────────────────"
echo " VibePrint OS — Dynamic Device Detection"
echo "──────────────────────────────────────────────────"
if [ ${#VIDEO_DEVICES[@]} -eq 0 ]; then
    echo " Camera:  ⚠  No /dev/video* devices found"
    echo "          Camera features will use mock mode"
else
    echo " Camera:  ✓  Found ${#VIDEO_DEVICES[@]} device(s):"
    for dev in "${VIDEO_DEVICES[@]}"; do
        echo "          • $dev"
    done
fi
echo "──────────────────────────────────────────────────"

# ── Build docker compose command ─────────────────────────────────────────────
COMPOSE_FILES=(-f docker-compose.yml)

if [ "$MODE" = "dev" ]; then
    COMPOSE_FILES+=(-f docker-compose.dev.yml)
    echo " Mode:    dev (hot-reload enabled)"
else
    echo " Mode:    production"
fi
echo "──────────────────────────────────────────────────"

# Create a temporary compose override with detected devices
OVERRIDE_FILE=".docker-compose.devices.yml"

cat > "$OVERRIDE_FILE" <<'OVERRIDE_EOF'
services:
  app:
    devices:
OVERRIDE_EOF

# Always include USB bus for thermal printer
echo "      - /dev/bus/usb:/dev/bus/usb" >> "$OVERRIDE_FILE"

# Add each detected video device
for dev in ${VIDEO_DEVICES[@]+"${VIDEO_DEVICES[@]}"}; do
    echo "      - ${dev}:${dev}" >> "$OVERRIDE_FILE"
done

# Add cgroup rules for hot-plug support
cat >> "$OVERRIDE_FILE" <<'OVERRIDE_EOF'
    device_cgroup_rules:
      - 'c 81:* rwm'
      - 'c 189:* rwm'
OVERRIDE_EOF

COMPOSE_FILES+=(-f "$OVERRIDE_FILE")

echo ""
echo "Starting containers..."
docker compose "${COMPOSE_FILES[@]}" up --build -d

echo ""
docker compose "${COMPOSE_FILES[@]}" ps

echo ""
echo "✓ VibePrint OS is running"
if [ "$MODE" = "dev" ]; then
    echo "  Admin:  http://localhost:8000/admin"
    echo "  API:    http://localhost:8000/docs"
else
    echo "  Admin:  http://localhost:${APP_PORT:-8000}/admin"
    echo "  API:    http://localhost:${APP_PORT:-8000}/docs"
fi
