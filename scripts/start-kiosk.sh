#!/usr/bin/env bash
# =============================================================================
# start-kiosk.sh — Launch Chromium in kiosk mode pointing at VibePrint OS
# =============================================================================
# This script should be run on the kiosk host machine (not inside Docker).
# It detects an installed browser and launches it in borderless fullscreen mode.

set -euo pipefail

KIOSK_URL="${KIOSK_URL:-http://localhost:8000}"
BROWSER=""

# Detect available browser
if command -v chromium-browser &> /dev/null; then
    BROWSER="chromium-browser"
elif command -v chromium &> /dev/null; then
    BROWSER="chromium"
elif command -v google-chrome &> /dev/null; then
    BROWSER="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    BROWSER="google-chrome-stable"
else
    echo "ERROR: No supported browser found (chromium, chromium-browser, google-chrome)." >&2
    echo "Install one with: sudo apt install chromium-browser" >&2
    exit 1
fi

echo "Starting kiosk mode with: ${BROWSER}"
echo "Target URL: ${KIOSK_URL}"

# Launch browser in kiosk mode with lockdown flags
exec "${BROWSER}" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --no-first-run \
    --disable-features=TranslateUI \
    --disk-cache-dir=/dev/null \
    --disable-gpu-cache \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    "${KIOSK_URL}"
