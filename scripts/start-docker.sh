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
#
# Uses a helper function that refreshes the Windows PATH from registry before
# each call — this is critical because winget install updates the system PATH
# but the current PowerShell session inherits the stale PATH from WSL2.

# Run a usbipd command via PowerShell with refreshed PATH.
# Usage: run_usbipd "wsl list"   (prefix "usbipd" is added automatically)
# Returns output as string; always exits 0 (errors appear in output text).
run_usbipd() {
    local out
    out=$(powershell.exe -NoProfile -NonInteractive -Command \
        "\$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); usbipd $1" 2>&1) || true
    echo "$out" | tr -d '\r'
}

auto_attach_wsl2_usb() {
    # Temporarily disable exit-on-error — we handle all errors manually.
    # This prevents set -euo pipefail from killing the script if
    # powershell.exe or usbipd returns an unexpected error code.
    set +e

    # Check Windows interop is available
    if ! command -v powershell.exe &> /dev/null; then
        echo " USB:     Windows interop not available — cannot auto-attach"
        echo "          Install usbipd-win on Windows: winget install usbipd"
        set -e
        return
    fi

    # Check usbipd is installed on Windows host (with refreshed PATH)
    local check
    check=$(run_usbipd "version")
    if [ -z "$check" ]; then
        echo " USB:     usbipd-win not found — attempting auto-install..."
        local install_out
        install_out=$(powershell.exe -NoProfile -NonInteractive -Command "winget install usbipd --accept-source-agreements --accept-package-agreements" 2>&1 | tr -d '\r') || true
        if echo "$install_out" | grep -qi "successfully\|installed"; then
            echo " USB:     ✓ usbipd-win installed — waiting for service..."
            sleep 3
        else
            echo " USB:     Auto-install failed (needs Administrator elevation)"
            echo "          Run from Administrator PowerShell:"
            echo "          winget install usbipd"
            echo "          Then re-run this script."
            set -e
            return
        fi
    fi

    # List USB devices from Windows host
    # usbipd v5+ removed the "wsl" subcommand. Use "usbipd list" instead.
    local usb_list
    usb_list=$(run_usbipd "list")

    # Strip non-device lines (headers, persisted section, errors)
    usb_list=$(echo "$usb_list" | grep -v "^PS " | grep -viE "^error|^Persisted|^$|^GUID|^Connected")

    if [ -z "$usb_list" ]; then
        echo " USB:     Could not list Windows USB devices"
        echo "          Try manually from PowerShell: usbipd list"
        set -e
        return
    fi

    # Parse output and auto-attach cameras and printers
    # usbipd list format: "BUSID  VID:PID    DEVICE   STATE"
    # State can be: "Not shared", "Shared", or "Attached"
    local attached=0
    local tried=0
    while IFS= read -r line; do
        # Skip header line
        [[ "$line" == BUSID* ]] && continue
        # Skip empty lines
        [[ -z "$line" ]] && continue

        local busid state
        busid=$(echo "$line" | awk '{print $1}')

        # State is the last field(s): "Attached", "Shared", or "Not shared"
        # Check from the end of the line
        if echo "$line" | grep -qE "Not shared$"; then
            state="Not shared"
        elif echo "$line" | grep -qE "Shared$"; then
            state="Shared"
        elif echo "$line" | grep -qE "Attached$"; then
            state="Attached"
        else
            continue
        fi

        # Skip already attached devices
        [[ "$state" == "Attached" ]] && continue

        # Only attach devices that look like cameras or printers
        if echo "$line" | grep -qiE "camera|webcam|integrated.*cam|printer|pos|thermal|epson|xprinter|bixolon"; then
            local device_name
            # Extract device name: between VID:PID and STATE
            device_name=$(echo "$line" | sed 's/^[^ ]*  *[^ ]*  *//' | sed 's/  *\(Not shared\|Shared\|Attached\)$//')
            echo " USB:     Attaching: $device_name ($busid)"
            ((tried++))

            # Step 1: Bind (share) the device — requires admin
            if [[ "$state" == "Not shared" ]]; then
                local bind_result
                bind_result=$(run_usbipd "bind --busid $busid") || true
                if echo "$bind_result" | grep -qi "error\|fail\|denied\|not accessible\|administrator"; then
                    echo " USB:     ✗ Failed to bind $busid (needs admin)"
                    echo "          $bind_result"
                    echo "          Run from Administrator PowerShell:"
                    echo "          usbipd bind --busid $busid && usbipd attach --wsl --busid $busid"
                    continue
                fi
                echo " USB:     ✓ Bound $busid"
            fi

            # Step 2: Attach to WSL2
            local result
            result=$(run_usbipd "attach --wsl --busid $busid") || true
            if echo "$result" | grep -qi "error\|fail\|denied\|not shared\|not accessible"; then
                echo " USB:     ✗ Failed to attach $busid"
                echo "          $result"
                echo "          Try from an Administrator PowerShell:"
                echo "          usbipd bind --busid $busid && usbipd attach --wsl --busid $busid"
            else
                echo " USB:     ✓ Attached $busid"
                ((attached++))
            fi
        fi
    done <<< "$usb_list"

    if [ "$tried" -eq 0 ]; then
        echo " USB:     No USB cameras or printers found on Windows host"
    elif [ "$attached" -eq 0 ]; then
        echo " USB:     Could not auto-attach (needs Administrator elevation)"
        echo "          Run from Administrator PowerShell:"
        echo "          usbipd attach --wsl --busid <BUSID>"
    else
        echo " USB:     Attached $attached device(s) via usbipd-win"
        # Give WSL2 a moment to create /dev nodes
        sleep 2
    fi

    # Re-enable exit-on-error
    set -e
}

if [ "$PLATFORM" = "wsl2" ]; then
    auto_attach_wsl2_usb || echo " USB:     Auto-attach encountered an error, continuing without hardware passthrough"
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
        echo "          usbipd attach --wsl --busid <BUSID>"
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
        echo "          usbipd attach --wsl --busid <BUSID>"
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
