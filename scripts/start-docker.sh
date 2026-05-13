#!/usr/bin/env bash
# =============================================================================
# start-docker.sh — Start VibePrint OS with dynamic hardware detection
# =============================================================================
# Usage:
#   ./scripts/start-docker.sh              # Start in production mode
#   ./scripts/start-docker.sh dev          # Start in dev mode (hot-reload)
#   ./scripts/start-docker.sh down         # Stop all containers
#
# Automatically detects all connected /dev/video* devices and USB thermal
# printers, then passes them to Docker. If no camera/printer is plugged in,
# the app starts normally and services fall back to mock/offline mode.
#
# On first run, installs a broad USB udev rule so Docker can access thermal
# printers without manual setup.
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

# ── Setup USB permissions ────────────────────────────────────────────────────
setup_usb_permissions() {
    UDEV_RULE_FILE="/etc/udev/rules.d/99-thermavibe-usb.rules"

    if [ -f "$UDEV_RULE_FILE" ]; then
        echo " USB:     USB permissions already configured"
        return 0
    fi

    echo " USB:     Setting up USB device permissions (requires sudo)..."
    sudo tee "$UDEV_RULE_FILE" > /dev/null << 'UDEV_EOF'
# VibePrint OS — USB device access for thermal printers
# Allows the Docker container to access any USB thermal printer
# without needing specific VID/PID rules for each model.
SUBSYSTEM=="usb", MODE="0666"
SUBSYSTEM=="usb_device", MODE="0666"
UDEV_EOF

    sudo udevadm control --reload-rules 2>/dev/null || true
    sudo udevadm trigger 2>/dev/null || true
    echo " USB:     USB permissions configured (all USB devices accessible)"

    # Blacklist usblp kernel module — it claims USB printers and blocks
    # python-escpos from accessing them directly via pyusb.
    if lsmod 2>/dev/null | grep -q '^usblp'; then
        sudo rmmod usblp 2>/dev/null || true
        echo " USB:     Unloaded usblp kernel module"
    fi
    if [ ! -f /etc/modprobe.d/thermavibe-blacklist-usblp.conf ]; then
        echo "blacklist usblp" | sudo tee /etc/modprobe.d/thermavibe-blacklist-usblp.conf > /dev/null 2>/dev/null || true
    fi
}

setup_usb_permissions || echo " USB:     Could not set up udev rules (run with sudo or set up manually)"

# ── Detect video devices ─────────────────────────────────────────────────────
VIDEO_DEVICES=()
if ls /dev/video* >/dev/null 2>&1; then
    for dev in /dev/video*; do
        VIDEO_DEVICES+=("$dev")
    done
fi

# ── Detect USB thermal printers ──────────────────────────────────────────────
PRINTERS=()
if command -v lsusb &> /dev/null; then
    while IFS= read -r line; do
        PRINTERS+=("$line")
    done < <(lsusb 2>/dev/null | grep -iE "printer|pos|thermal|epson|xprinter|bixolon|0fe6|custom|star" || true)
fi

echo "──────────────────────────────────────────────────"
echo " VibePrint OS — Dynamic Hardware Detection"
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

if [ ${#PRINTERS[@]} -eq 0 ]; then
    echo " Printer: ⚠  No thermal printers detected"
    echo "          Will auto-detect when plugged in (hot-plug)"
else
    echo " Printer: ✓  Detected ${#PRINTERS[@]} potential printer(s):"
    for p in "${PRINTERS[@]}"; do
        echo "          • $p"
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

# Collect device mappings
DEVICE_ENTRIES=()
if [ -d /dev/bus/usb ]; then
    DEVICE_ENTRIES+=("/dev/bus/usb:/dev/bus/usb")
fi
for dev in ${VIDEO_DEVICES[@]+"${VIDEO_DEVICES[@]}"}; do
    DEVICE_ENTRIES+=("${dev}:${dev}")
done

if [ ${#DEVICE_ENTRIES[@]} -gt 0 ]; then
    cat > "$OVERRIDE_FILE" <<OVERRIDE_EOF
services:
  app:
    devices:
OVERRIDE_EOF
    for entry in "${DEVICE_ENTRIES[@]}"; do
        echo "      - ${entry}" >> "$OVERRIDE_FILE"
    done

    # Add cgroup rules for hot-plug support
    cat >> "$OVERRIDE_FILE" <<'OVERRIDE_EOF'
    device_cgroup_rules:
      - 'c 81:* rwm'
      - 'c 189:* rwm'
OVERRIDE_EOF

    COMPOSE_FILES+=(-f "$OVERRIDE_FILE")
else
    # No devices at all — skip override file
    rm -f "$OVERRIDE_FILE"
fi

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
