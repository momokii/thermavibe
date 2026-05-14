#!/usr/bin/env bash
# =============================================================================
# start-docker.sh — Start VibePrint OS with dynamic hardware detection
# =============================================================================
# Usage:
#   ./scripts/start-docker.sh              # Start in production mode
#   ./scripts/start-docker.sh dev          # Start in dev mode (hot-reload)
#   ./scripts/start-docker.sh down         # Stop all containers
#
# Automatically detects connected cameras and USB thermal printers, then
# passes them to Docker. If no camera/printer is plugged in, the app
# starts normally and services fall back to mock/offline mode.
#
# Platform support:
#   Linux  — Full hardware detection and udev setup
#   WSL2   — Hardware passthrough via usbipd-win (auto-detected)
#   Other  — Mock mode (no hardware paths available)
#
# On first run (Linux), installs a broad USB udev rule so Docker can
# access thermal printers without manual setup.
# =============================================================================

set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-prod}"

# ── Platform detection ──────────────────────────────────────────────────────
detect_platform() {
    local kernel_name
    kernel_name="$(uname -s)"
    if [ "$kernel_name" = "Linux" ]; then
        if echo "$(uname -r)" | grep -qiE "microsoft|wsl"; then
            echo "wsl2"
        else
            echo "linux"
        fi
    else
        echo "other"
    fi
}

PLATFORM="$(detect_platform)"

# ── Stop / down ──────────────────────────────────────────────────────────────
if [ "$MODE" = "down" ]; then
    echo "Stopping VibePrint OS..."
    docker compose down
    exit 0
fi

# ── Setup USB permissions (Linux only) ──────────────────────────────────────
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

case "$PLATFORM" in
    linux)
        setup_usb_permissions || echo " USB:     Could not set up udev rules (run with sudo or set up manually)"
        ;;
    wsl2)
        echo " USB:     Skipping udev setup (not applicable in WSL2)"
        ;;
    *)
        echo " USB:     Skipping udev setup (not applicable on this platform)"
        ;;
esac

# ── Auto-attach USB devices on WSL2 ─────────────────────────────────────────
# Calls powershell.exe from within WSL2 to run usbipd-win commands.
# This makes Windows USB devices (webcams, printers) appear as /dev/video* and
# /dev/bus/usb inside WSL2, so the normal Linux detection can find them.
auto_attach_wsl2_usb() {
    # Check Windows interop is available
    if ! command -v powershell.exe &> /dev/null; then
        echo " USB:     Windows interop not available — cannot auto-attach"
        echo "          Install usbipd-win on Windows: winget install usbipd"
        return
    fi

    # Check usbipd is installed on Windows host
    if ! powershell.exe -NoProfile -Command "Get-Command usbipd -ErrorAction SilentlyContinue" 2>/dev/null | grep -qi "usbipd"; then
        echo " USB:     usbipd-win not installed on Windows host"
        echo "          Install from Administrator PowerShell: winget install usbipd"
        echo "          https://learn.microsoft.com/en-us/windows/wsl/connect-usb"
        return
    fi

    # List USB devices from Windows host
    local usb_list
    usb_list=$(powershell.exe -NoProfile -NonInteractive -Command "usbipd wsl list" 2>/dev/null | tr -d '\r') || true

    if [ -z "$usb_list" ]; then
        echo " USB:     Could not list Windows USB devices"
        return
    fi

    # Parse output and auto-attach cameras and printers
    # Format: "BUSID  DEVICE_NAME  STATE"
    local attached=0
    local tried=0
    while IFS= read -r line; do
        # Skip header line
        [[ "$line" == BUSID* ]] && continue
        # Skip empty lines
        [[ -z "$line" ]] && continue

        local busid state
        busid=$(echo "$line" | awk '{print $1}')
        state=$(echo "$line" | awk '{print $NF}')

        # Skip already attached devices
        [[ "$state" == "Attached" ]] && continue
        # Skip devices that aren't shared/attachable
        [[ "$state" != "Not shared" && "$state" != "Shared" ]] && continue

        # Only attach devices that look like cameras or printers
        if echo "$line" | grep -qiE "camera|webcam|integrated.*cam|printer|pos|thermal|epson|xprinter|bixolon"; then
            local device_name
            device_name=$(echo "$line" | sed 's/^[^ ]*  *//' | sed 's/  *[^ ]*$//')
            echo " USB:     Attaching: $device_name ($busid)"
            ((tried++))
            if powershell.exe -NoProfile -NonInteractive -Command "usbipd wsl attach --busid $busid" 2>/dev/null; then
                echo " USB:     ✓ Attached $busid"
                ((attached++))
            else
                echo " USB:     ✗ Failed to attach $busid"
                echo "          Try from an Administrator PowerShell:"
                echo "          usbipd wsl attach --busid $busid"
            fi
        fi
    done <<< "$usb_list"

    if [ "$tried" -eq 0 ]; then
        echo " USB:     No USB cameras or printers found on Windows host"
    elif [ "$attached" -eq 0 ]; then
        echo " USB:     Could not auto-attach (needs Administrator elevation)"
        echo "          Run from Administrator PowerShell:"
        echo "          usbipd wsl attach --busid <BUSID>"
    else
        echo " USB:     Attached $attached device(s) via usbipd-win"
        # Give WSL2 a moment to create /dev nodes
        sleep 2
    fi
}

if [ "$PLATFORM" = "wsl2" ]; then
    auto_attach_wsl2_usb
fi

# ── Detect video devices ─────────────────────────────────────────────────────
VIDEO_DEVICES=()

detect_video_devices() {
    if ls /dev/video* >/dev/null 2>&1; then
        for dev in /dev/video*; do
            VIDEO_DEVICES+=("$dev")
        done
    fi
}

case "$PLATFORM" in
    linux|wsl2)
        detect_video_devices
        ;;
esac

# ── Detect USB thermal printers ──────────────────────────────────────────────
PRINTERS=()

detect_printers() {
    if command -v lsusb &> /dev/null; then
        while IFS= read -r line; do
            PRINTERS+=("$line")
        done < <(lsusb 2>/dev/null | grep -iE "printer|pos|thermal|epson|xprinter|bixolon|0fe6|custom|star" || true)
    fi
}

case "$PLATFORM" in
    linux|wsl2)
        detect_printers
        ;;
esac

# ── Hardware detection banner ────────────────────────────────────────────────
echo "──────────────────────────────────────────────────"
echo " VibePrint OS — Dynamic Hardware Detection"
echo " Platform: $PLATFORM"
if [ "$PLATFORM" = "wsl2" ]; then
    echo " Note:     Hardware requires usbipd-win passthrough"
fi
echo "──────────────────────────────────────────────────"
if [ ${#VIDEO_DEVICES[@]} -eq 0 ]; then
    echo " Camera:  ⚠  No /dev/video* devices found"
    echo "          Camera features will use mock mode"
    if [ "$PLATFORM" = "wsl2" ]; then
        echo "          Tip: Install usbipd-win and re-run, or attach manually:"
        echo "          usbipd wsl attach --busid <BUSID>"
    fi
else
    echo " Camera:  ✓  Found ${#VIDEO_DEVICES[@]} device(s):"
    for dev in "${VIDEO_DEVICES[@]}"; do
        echo "          • $dev"
    done
fi

if [ ${#PRINTERS[@]} -eq 0 ]; then
    echo " Printer: ⚠  No thermal printers detected"
    echo "          Will auto-detect when plugged in (hot-plug)"
    if [ "$PLATFORM" = "wsl2" ]; then
        echo "          Tip: Attach via usbipd-win and re-run, or:"
        echo "          usbipd wsl attach --busid <BUSID>"
    fi
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

    # Add cgroup rules for hot-plug support (Linux only)
    if [ "$PLATFORM" = "linux" ]; then
        cat >> "$OVERRIDE_FILE" <<'OVERRIDE_EOF'
    device_cgroup_rules:
      - 'c 81:* rwm'
      - 'c 189:* rwm'
OVERRIDE_EOF
    fi

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
