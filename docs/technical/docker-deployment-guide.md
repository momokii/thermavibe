# VibePrint OS -- Docker Deployment Guide

> This document provides a complete guide for deploying VibePrint OS to production using Docker Compose on a single Linux machine (Ubuntu/Debian). It covers container architecture, environment configuration, USB device passthrough, Chromium kiosk launch, production checklist, updates, backup, and troubleshooting.
>
> **Scope:** This guide covers the **single-kiosk** deployment (one machine, one camera, one display). For multi-room deployments with a central server and distributed room agents, see [multi-kiosk-architecture.md](multi-kiosk-architecture.md).

---

## Table of Contents

1. [Docker Compose Architecture](#1-docker-compose-architecture)
2. [Environment Configuration](#2-environment-configuration)
3. [USB Device Passthrough](#3-usb-device-passthrough)
4. [Chromium Kiosk Launch](#4-chromium-kiosk-launch)
5. [Production Deployment Checklist](#5-production-deployment-checklist)
6. [Updating](#6-updating)
7. [Backup](#7-backup)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Docker Compose Architecture

### Container Overview

VibePrint OS runs two Docker containers managed by a single Docker Compose file:

| Container | Image | Purpose | Ports |
|-----------|-------|---------|-------|
| `app` | `vibeprint-os:latest` (custom build) | FastAPI backend + built frontend static files | `8000` (internal) |
| `postgres` | `postgres:16-alpine` | PostgreSQL 16 database | `5432` (internal only) |

### Network Topology

```
+--------------------------------------------------+
|              Docker Network: vibeprint-net         |
|              (bridge driver, internal)             |
|                                                    |
|  +--------------------+     +------------------+   |
|  | app (FastAPI)      |     | postgres         |   |
|  | 172.20.0.2:8000    |---->| 172.20.0.3:5432  |   |
|  +--------+-----------+     +------------------+   |
|           |                                        |
+-----------|----------------------------------------+
            | port mapping (127.0.0.1:8000 -> 8000)
            |
    +-------v-------+
    | Host Machine   |
    | localhost:8000 |
    +-------+-------+
            |
    +-------v-------+
    | Chromium       |
    | --kiosk mode   |
    +---------------+
```

The `postgres` container is only accessible from within the Docker network. Its port 5432 is not mapped to the host, preventing external database access. The `app` container binds port 8000 to `127.0.0.1` on the host, making it accessible only to local processes (Chromium, curl for testing).

### docker-compose.yml Reference

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    container_name: vibeprint-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-thermavibe}
      POSTGRES_USER: ${POSTGRES_USER:-thermavibe}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - vibeprint-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-thermavibe}"]
      interval: 5s
      timeout: 3s
      retries: 5
      start_period: 10s

  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: vibeprint-app
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:${APP_PORT:-8000}:8000"
    environment:
      APP_ENV: production
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-thermavibe}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-thermavibe}
      APP_SECRET_KEY: ${APP_SECRET_KEY:?APP_SECRET_KEY must be set}
      ADMIN_PIN: ${ADMIN_PIN:?ADMIN_PIN must be set}
      AI_PROVIDER: ${AI_PROVIDER:-mock}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY:-}
      OLLAMA_BASE_URL: ${OLLAMA_BASE_URL:-http://host.docker.internal:11434}
      PAYMENT_ENABLED: ${PAYMENT_ENABLED:-false}
      PAYMENT_PROVIDER: ${PAYMENT_PROVIDER:-mock}
      MIDTRANS_SERVER_KEY: ${MIDTRANS_SERVER_KEY:-}
      MIDTRANS_CLIENT_KEY: ${MIDTRANS_CLIENT_KEY:-}
      MIDTRANS_IS_PRODUCTION: ${MIDTRANS_IS_PRODUCTION:-false}
      PRINTER_ENABLED: ${PRINTER_ENABLED:-true}
      PRINTER_VENDOR_ID: ${PRINTER_VENDOR_ID:-0x04b8}
      PRINTER_PRODUCT_ID: ${PRINTER_PRODUCT_ID:-0x0202}
      CAMERA_ENABLED: ${CAMERA_ENABLED:-true}
      CAMERA_DEVICE_INDEX: ${CAMERA_DEVICE_INDEX:-0}
      LOG_LEVEL: ${LOG_LEVEL:-INFO}
    volumes:
      - printer_temp:/tmp/printer
    networks:
      - vibeprint-net
    devices:
      - ${PRINTER_USB_DEVICE:-/dev/bus/usb/001/004}:${PRINTER_USB_DEVICE:-/dev/bus/usb/001/004}
      - ${CAMERA_VIDEO_DEVICE:-/dev/video0}:${CAMERA_VIDEO_DEVICE:-/dev/video0}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

volumes:
  postgres_data:
    name: vibeprint-postgres-data
  printer_temp:
    name: vibeprint-printer-temp

networks:
  vibeprint-net:
    driver: bridge
    name: vibeprint-net
```

### Dockerfile Reference

```dockerfile
# ---- Stage 1: Build Frontend ----
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Production Application ----
FROM python:3.12-slim

# Install system dependencies for python-escpos (libusb) and OpenCV (libGL)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0 \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend into backend static directory
COPY --from=frontend-builder /build/frontend/dist ./backend/static/

# Copy Alembic migrations
COPY backend/alembic/ ./alembic/
COPY backend/alembic.ini ./

# Run migrations on startup, then start the application
CMD ["sh", "-c", "alembic upgrade head && uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
```

---

## 2. Environment Configuration

### Complete Environment Variables Reference

Create a `.env` file in the project root. The following table describes every variable, its purpose, and recommended production values.

#### Database

| Variable | Required | Default | Production Guidance |
|----------|----------|---------|---------------------|
| `POSTGRES_DB` | No | `thermavibe` | Keep default unless running multiple instances |
| `POSTGRES_USER` | No | `thermavibe` | Keep default unless custom user management is needed |
| `POSTGRES_PASSWORD` | Yes | (none) | **MUST be changed.** Use a strong random password: `openssl rand -hex 32` |

#### Application

| Variable | Required | Default | Production Guidance |
|----------|----------|---------|---------------------|
| `APP_ENV` | No | `production` | Set to `production` (disables debug output, stack traces) |
| `APP_SECRET_KEY` | Yes | (none) | **MUST be changed.** Used for JWT token signing. Generate with `openssl rand -hex 32` |
| `APP_PORT` | No | `8000` | Keep default unless port 8000 is in use on the host |
| `ADMIN_PIN` | Yes | (none) | **MUST be changed.** Set a 4-8 digit PIN for admin dashboard access |
| `ADMIN_SESSION_TTL_HOURS` | No | `24` | Admin session duration in hours. Auto-logouts after expiry. |
| `LOG_LEVEL` | No | `INFO` | `INFO` for production. Use `WARNING` or `ERROR` to reduce log volume |

#### AI Provider

| Variable | Required | Default | Production Guidance |
|----------|----------|---------|---------------------|
| `AI_PROVIDER` | No | `mock` | Set to `openai`, `anthropic`, `google`, or `ollama` for production |
| `OPENAI_API_KEY` | No | (empty) | Required if `AI_PROVIDER=openai`. Obtain from platform.openai.com |
| `OPENAI_MODEL` | No | `gpt-4o` | Model name for image analysis |
| `ANTHROPIC_API_KEY` | No | (empty) | Required if `AI_PROVIDER=anthropic`. Obtain from console.anthropic.com |
| `ANTHROPIC_MODEL` | No | `claude-sonnet-4-20250514` | Model name for image analysis |
| `GOOGLE_API_KEY` | No | (empty) | Required if `AI_PROVIDER=google`. Obtain from aistudio.google.com |
| `GOOGLE_MODEL` | No | `gemini-2.0-flash` | Model name for image analysis |
| `OLLAMA_BASE_URL` | No | `http://host.docker.internal:11434` | Required if `AI_PROVIDER=ollama`. URL of Ollama server |
| `OLLAMA_MODEL` | No | `llava` | Ollama model name for image analysis |

#### Payment

| Variable | Required | Default | Production Guidance |
|----------|----------|---------|---------------------|
| `PAYMENT_ENABLED` | No | `false` | Set to `true` to enable payment step |
| `PAYMENT_PROVIDER` | No | `mock` | Set to `midtrans` or `xendit` for production |
| `MIDTRANS_SERVER_KEY` | No | (empty) | Required if `PAYMENT_PROVIDER=midtrans`. Server key from Midtrans dashboard |
| `MIDTRANS_CLIENT_KEY` | No | (empty) | Required if `PAYMENT_PROVIDER=midtrans`. Client key for frontend QR display |
| `MIDTRANS_IS_PRODUCTION` | No | `false` | Set to `true` when using production Midtrans keys |
| `XENDIT_SECRET_KEY` | No | (empty) | Required if `PAYMENT_PROVIDER=xendit`. Secret key from Xendit dashboard |
| `XENDIT_IS_PRODUCTION` | No | `false` | Set to `true` when using production Xendit keys |

#### Printer

| Variable | Required | Default | Production Guidance |
|----------|----------|---------|---------------------|
| `PRINTER_ENABLED` | No | `true` | Set to `false` to disable printer (prints to screen only) |
| `PRINTER_VENDOR_ID` | No | `0x04b8` | USB vendor ID of your thermal printer (from `lsusb`) |
| `PRINTER_PRODUCT_ID` | No | `0x0202` | USB product ID of your thermal printer (from `lsusb`) |
| `PRINTER_USB_DEVICE` | No | `/dev/bus/usb/001/004` | USB device path in Docker (overridden by udev symlink) |

#### Camera

| Variable | Required | Default | Production Guidance |
|----------|----------|---------|---------------------|
| `CAMERA_ENABLED` | No | `true` | Set to `false` to disable camera (uses test images) |
| `CAMERA_DEVICE_INDEX` | No | `0` | V4L2 device index (`/dev/video0` = index 0) |
| `CAMERA_VIDEO_DEVICE` | No | `/dev/video0` | Video device path in Docker |
| `CAMERA_RESOLUTION_WIDTH` | No | `1280` | Capture resolution width in pixels |
| `CAMERA_RESOLUTION_HEIGHT` | No | `720` | Capture resolution height in pixels |
| `CAMERA_MJPEG_QUALITY` | No | `85` | JPEG compression quality (1-100) |

### Generating Secure Values

```bash
# Generate a strong database password
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" >> .env

# Generate a strong application secret key
echo "APP_SECRET_KEY=$(openssl rand -hex 32)" >> .env

# Generate a random admin PIN (6 digits)
echo "ADMIN_PIN=$(shuf -i 100000-999999 -n 1)" >> .env
```

---

## 3. USB Device Passthrough

USB devices (thermal printer and camera) must be passed through to the Docker container so the application can access them. Docker provides two mechanisms for this: `devices` mapping (device file passthrough) and `privileged` mode (all devices). VibePrint OS uses the `devices` mapping approach for security.

### Step 1: Identify USB Devices

Connect the thermal printer and camera to the host machine. Identify their USB attributes:

```bash
# List all USB devices
lsusb

# Example output:
# Bus 001 Device 004: ID 04b8:0202 Seiko Epson Corp. TM-T20II
# Bus 001 Device 005: ID 046d:0825 Logitech, Inc. Webcam C925e

# List video devices
ls -la /dev/video*
# Example output:
# crw-rw----+ 1 root video 81, 0 Jun 15 10:00 /dev/video0

# Identify the USB bus/device path for the printer
ls -la /dev/bus/usb/001/004
# Example output:
# crw-rw-rw-+ 1 root root 189, 387 Jun 15 10:00 /dev/bus/usb/001/004
```

### Step 2: Create Persistent udev Rules

USB device bus paths (`/dev/bus/usb/001/004`) change when devices are unplugged and reconnected. Create udev rules that create stable symlinks based on vendor and product IDs:

```bash
sudo tee /etc/udev/rules.d/99-thermavibe.rules << 'EOF'
# VibePrint OS - Thermal Printer
# Match by vendor and product ID, create stable symlink
SUBSYSTEM=="usb", \
    ATTR{idVendor}=="04b8", ATTR{idProduct}=="0202", \
    MODE="0666", \
    SYMLINK+="thermavibe-printer", \
    TAG+="systemd", ENV{SYSTEMD_WANTS}="vibeprint-usb.service"

# VibePrint OS - USB Camera
# Match video4linux devices, set permissions
SUBSYSTEM=="video4linux", \
    ATTR{name}=="*", \
    MODE="0666", \
    SYMLINK+="thermavibe-camera%n"
EOF

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger

# Verify symlinks were created
ls -la /dev/thermavibe-printer
ls -la /dev/thermavibe-camera*
```

### Step 3: Configure Docker Device Passthrough

Update the `.env` file to use the stable symlinks:

```bash
PRINTER_USB_DEVICE=/dev/thermavibe-printer
CAMERA_VIDEO_DEVICE=/dev/thermavibe-camera0
```

The `docker-compose.yml` references these variables in the `devices` section:

```yaml
services:
  app:
    devices:
      - ${PRINTER_USB_DEVICE}:${PRINTER_USB_DEVICE}
      - ${CAMERA_VIDEO_DEVICE}:${CAMERA_VIDEO_DEVICE}
```

### Step 4: Verify Device Access Inside Container

After starting the container, verify that the devices are accessible:

```bash
# Check printer device
docker compose exec app ls -la /dev/thermavibe-printer
# Expected: crw-rw-rw- ... /dev/thermavibe-printer

# Check camera device
docker compose exec app ls -la /dev/thermavibe-camera0
# Expected: crw-rw-rw- ... /dev/thermavibe-camera0

# Test USB device enumeration inside container
docker compose exec app python -c "
import usb.core
devices = usb.core.find(find_all=True)
for d in devices:
    print(f'Vendor: {hex(d.idVendor)}, Product: {hex(d.idProduct)}')
"
```

### Alternative: Video Group Mapping

If the `devices` approach does not work for the camera, add the Docker container to the `video` group:

```yaml
services:
  app:
    group_add:
      - video
    devices:
      - ${PRINTER_USB_DEVICE}:${PRINTER_USB_DEVICE}
    # Camera is accessible via /dev/video0 with video group permissions
```

---

## 4. Chromium Kiosk Launch

The kiosk UI is rendered by Chromium running on the host machine (not inside Docker) in `--kiosk` mode, pointing at the FastAPI backend which serves the built React SPA.

### scripts/start-kiosk.sh

```bash
#!/usr/bin/env bash
#
# start-kiosk.sh - Launch Chromium in kiosk mode for VibePrint OS
#
# This script should be run after Docker Compose is started.
# It is designed to be launched as a systemd service.

set -euo pipefail

# Configuration
KIOSK_URL="${KIOSK_URL:-http://localhost:8000}"
CHROMIUM_BIN="${CHROMIUM_BIN:-chromium-browser}"
DISPLAY="${DISPLAY:-:0}"
USER="${KIOSK_USER:-$(whoami)}"
LOG_FILE="/var/log/vibeprint-kiosk.log"

# Wait for the backend to be ready
echo "[$(date)] Waiting for backend at ${KIOSK_URL}..." >> "${LOG_FILE}"
until curl -sf "${KIOSK_URL}/api/v1/health" > /dev/null 2>&1; do
    sleep 2
done
echo "[$(date)] Backend is ready. Launching Chromium..." >> "${LOG_FILE}"

# Kill any existing Chromium kiosk processes
pkill -f "chromium.*--kiosk" 2>/dev/null || true
sleep 1

# Launch Chromium in kiosk mode
exec "${CHROMIUM_BIN}" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --no-first-run \
    --disable-features=TranslateUI \
    --disable-breakpad \
    --disable-component-update \
    --disable-background-networking \
    --disable-sync \
    --disable-default-apps \
    --disable-extensions \
    --disable-print-preview \
    --disable-save-password-bubble \
    --disable-translate-new-ux \
    --enable-low-res-tiling \
    --force-device-scale-factor=1.0 \
    --disable-gpu \
    --disable-software-rasterizer \
    --in-process-gpu \
    --autoplay-policy=no-user-gesture-required \
    --use-fake-ui-for-media-stream \
    "${KIOSK_URL}" \
    >> "${LOG_FILE}" 2>&1
```

### systemd Service

Create a systemd service to automatically start Chromium on boot and restart it if it crashes:

```bash
sudo tee /etc/systemd/system/vibeprint-kiosk.service << 'EOF'
[Unit]
Description=VibePrint OS Kiosk (Chromium)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=kiosk-user
Environment=DISPLAY=:0
Environment=KIOSK_URL=http://localhost:8000
Environment=CHROMIUM_BIN=/usr/bin/chromium-browser
ExecStartPre=/bin/sleep 10
ExecStart=/opt/thermavibe/scripts/start-kiosk.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable vibeprint-kiosk.service
sudo systemctl start vibeprint-kiosk.service

# Check status
sudo systemctl status vibeprint-kiosk.service
```

### systemd Service for Docker Compose

Create a systemd service to manage Docker Compose:

```bash
sudo tee /etc/systemd/system/vibeprint-app.service << 'EOF'
[Unit]
Description=VibePrint OS Application (Docker Compose)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/thermavibe
ExecStart=/usr/bin/docker compose -f docker-compose.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.yml down
ExecReload=/usr/bin/docker compose -f docker-compose.yml restart

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable vibeprint-app.service
sudo systemctl start vibeprint-app.service
```

### Display Server Requirements

Chromium requires a display server (X11 or Wayland). For a kiosk deployment:

- **X11 (recommended):** Install `xserver-xorg` and configure auto-login. Create an `.xsession` file that starts the X server and launches the kiosk service.
- **Wayland:** Supported by Chromium but may require additional configuration for kiosk mode. X11 is recommended for simplicity.
- **Headless setups:** Use `Xvfb` (X Virtual Framebuffer) for testing without a physical display. Not recommended for production kiosks.

```bash
# Install X11 server (Ubuntu/Debian)
sudo apt install xserver-xorg xserver-xorg-video-all xinit

# Configure auto-login (create/edit /etc/lightdm/lightdm.conf)
[SeatDefaults]
autologin-user=kiosk-user
autologin-user-timeout=0
user-session=xinit
```

---

## 5. Production Deployment Checklist

Before deploying VibePrint OS to a production kiosk machine, complete the following checklist:

### Security

- [ ] Change `POSTGRES_PASSWORD` to a strong random value (`openssl rand -hex 32`)
- [ ] Change `APP_SECRET_KEY` to a strong random value (`openssl rand -hex 32`)
- [ ] Change `ADMIN_PIN` to a unique 4-8 digit code
- [ ] Ensure `.env` file permissions are restrictive (`chmod 600 .env`)
- [ ] Verify that port 8000 is only bound to `127.0.0.1` (not `0.0.0.0`)
- [ ] Disable USB storage automounting on the kiosk machine
- [ ] Disable unnecessary system services (bluetooth, avahi, etc.)

### AI Provider

- [ ] Set `AI_PROVIDER` to your chosen provider (`openai`, `anthropic`, `google`, `ollama`)
- [ ] Set the corresponding API key (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)
- [ ] If using Ollama, ensure it is running and accessible from the Docker container
- [ ] Test AI analysis with a sample image via `POST /api/v1/ai/analyze`
- [ ] Verify response latency is acceptable for the kiosk experience (< 10 seconds)

### Payment Gateway (if enabled)

- [ ] Set `PAYMENT_ENABLED=true`
- [ ] Set `PAYMENT_PROVIDER` to `midtrans` or `xendit`
- [ ] Set production API keys (not sandbox keys)
- [ ] Set `MIDTRANS_IS_PRODUCTION=true` or `XENDIT_IS_PRODUCTION=true`
- [ ] Configure a public URL or reverse proxy for webhook delivery
- [ ] Test the complete payment flow: create QR, scan QR, verify webhook, confirm status
- [ ] Test payment timeout handling (what happens after 15 minutes without payment)

### Thermal Printer

- [ ] Connect printer via USB and verify it appears in `lsusb`
- [ ] Create udev rules for stable device symlinks
- [ ] Set `PRINTER_VENDOR_ID` and `PRINTER_PRODUCT_ID` in `.env`
- [ ] Verify device passthrough into Docker container
- [ ] Print a test receipt via `POST /api/v1/admin/hardware/printer/test`
- [ ] Verify print quality (text alignment, image dithering, paper cutting)
- [ ] Verify paper-out detection (if supported by printer model)

### Camera

- [ ] Connect camera via USB and verify it appears in `lsusb` and `/dev/video*`
- [ ] Set `CAMERA_DEVICE_INDEX` in `.env`
- [ ] Verify device passthrough into Docker container
- [ ] Test MJPEG stream at `http://localhost:8000/api/v1/camera/stream`
- [ ] Test photo capture via `POST /api/v1/admin/hardware/camera/test`
- [ ] Verify image quality and resolution at configured settings
- [ ] Position camera for optimal framing of the subject

### Database

- [ ] Verify PostgreSQL container starts healthy
- [ ] Run migrations successfully (`alembic upgrade head`)
- [ ] Verify application can connect to database
- [ ] Set up automated backups (see [Backup](#7-backup) section)

### Kiosk Mode

- [ ] Install Chromium and verify `--kiosk` mode works
- [ ] Create systemd service for auto-start on boot
- [ ] Verify Chromium launches automatically after system boot
- [ ] Verify fullscreen display with no visible UI chrome
- [ ] Test keyboard shortcut blocking (Ctrl+Q, Alt+Tab, F11, etc.)
- [ ] Verify automatic restart if Chromium crashes
- [ ] Test display resolution and scaling

### Network (if payment is enabled)

- [ ] Ensure kiosk machine has stable internet access
- [ ] Configure firewall to only allow outbound HTTPS (no inbound except webhooks)
- [ ] Set up reverse proxy or ngrok for webhook delivery
- [ ] Test webhook delivery from payment gateway
- [ ] Configure DNS or static IP for webhook URL

---

## 6. Updating

### Standard Update Procedure

To update VibePrint OS to a new version:

```bash
# 1. Pull the latest code
cd /opt/thermavibe
git pull origin main

# 2. Rebuild the Docker image with the latest code
docker compose build

# 3. Restart containers with the new image
docker compose up -d

# 4. Run any pending database migrations
docker compose exec app alembic upgrade head

# 5. Restart Chromium to clear any cached assets
sudo systemctl restart vibeprint-kiosk.service
```

### Data Preservation

The following data persists across updates because it is stored in Docker named volumes or on the host filesystem:

| Data | Storage | Preserved During Update |
|------|---------|----------------------|
| PostgreSQL data | `vibeprint-postgres-data` volume | Yes (volume persists) |
| Session data | PostgreSQL | Yes |
| Configuration | PostgreSQL | Yes |
| Payment records | PostgreSQL | Yes |
| Printer temp files | `vibeprint-printer-temp` volume | Yes (auto-cleaned on reset) |
| Environment variables | `.env` file on host | Yes (not modified by update) |

### Rollback

If an update causes issues:

```bash
# Roll back to the previous git commit
cd /opt/thermavibe
git log --oneline -5  # Find the previous commit hash
git checkout <previous-commit-hash>

# Rebuild and restart
docker compose build
docker compose up -d

# If database migrations need to be rolled back
docker compose exec app alembic downgrade -1
```

### One-Command Update Script

For operators who prefer a single command:

```bash
#!/usr/bin/env bash
# scripts/update.sh
set -euo pipefail

cd /opt/thermavibe

echo "Pulling latest code..."
git pull origin main

echo "Rebuilding Docker image..."
docker compose build --no-cache app

echo "Restarting application..."
docker compose up -d

echo "Running migrations..."
sleep 10  # Wait for app to start
docker compose exec -T app alembic upgrade head

echo "Restarting kiosk..."
sudo systemctl restart vibeprint-kiosk.service

echo "Update complete."
```

---

## 7. Backup

### PostgreSQL Database Backup

The database contains all session data, payment records, and configuration. Regular backups are essential.

#### Automated Backup Script

```bash
#!/usr/bin/env bash
# scripts/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/thermavibe/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/vibeprint_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

# Create compressed SQL dump
docker compose exec -T postgres pg_dump \
    -U "${POSTGRES_USER:-thermavibe}" \
    -d "${POSTGRES_DB:-thermavibe}" \
    --clean \
    --if-exists \
    | gzip > "${BACKUP_FILE}"

echo "Backup created: ${BACKUP_FILE}"
echo "Size: $(du -h "${BACKUP_FILE}" | cut -f1)"

# Clean up old backups
find "${BACKUP_DIR}" -name "vibeprint_*.sql.gz" -mtime +${BACKUP_RETENTION_DAYS} -delete
echo "Old backups cleaned (retention: ${BACKUP_RETENTION_DAYS} days)"
```

#### Schedule Automated Backups with cron

```bash
# Edit crontab
crontab -e

# Run backup every day at 2:00 AM
0 2 * * * /opt/thermavibe/scripts/backup.sh >> /var/log/vibeprint-backup.log 2>&1
```

#### Manual Backup

```bash
# Full SQL dump
docker compose exec postgres pg_dump -U thermavibe -d thermavibe > backup.sql

# Compressed SQL dump
docker compose exec postgres pg_dump -U thermavibe -d thermavibe | gzip > backup.sql.gz

# Custom format dump (supports parallel restore)
docker compose exec postgres pg_dump -U thermavibe -d thermavibe -Fc > backup.dump
```

### Restore from Backup

```bash
# Stop the application to prevent writes during restore
docker compose stop app

# Restore from SQL dump (compressed)
gunzip -c backup.sql.gz | docker compose exec -T postgres psql -U thermavibe -d thermavibe

# Restore from custom format dump
docker compose exec -T postgres pg_restore -U thermavibe -d thermavibe -c backup.dump

# Restart the application
docker compose start app
```

### Docker Volume Backup

As an alternative to SQL dumps, back up the entire PostgreSQL data volume:

```bash
# Create a tar archive of the volume
docker run --rm \
    -v vibeprint-postgres-data:/data \
    -v /opt/thermavibe/backups:/backup \
    alpine tar czf /backup/postgres_volume_$(date +%Y%m%d).tar.gz -C /data .

# Restore volume from archive
docker run --rm \
    -v vibeprint-postgres-data:/data \
    -v /opt/thermavibe/backups:/backup \
    alpine tar xzf /backup/postgres_volume_20250615.tar.gz -C /data
```

### Configuration Backup

Back up the `.env` file and udev rules:

```bash
# Back up configuration
cp /opt/thermavibe/.env /opt/thermavibe/backups/env_$(date +%Y%m%d).bak
cp /etc/udev/rules.d/99-thermavibe.rules /opt/thermavibe/backups/udev_rules_$(date +%Y%m%d).bak
```

---

## 8. Troubleshooting

### Printer Not Found in Container

**Symptoms:**
- `POST /api/v1/print/status` returns `connected: false`
- Backend logs show `USB device not found`
- `POST /api/v1/print/test` returns 503 PRINTER_ERROR

**Diagnosis:**

```bash
# 1. Check if printer is visible on the host
lsusb | grep -i "epson\|thermal\ pos\|pos\ printer"
# If empty: printer is not connected or USB cable is faulty

# 2. Check if USB device file exists on the host
ls -la /dev/bus/usb/001/
# Check for the correct device number

# 3. Check udev symlink
ls -la /dev/thermavibe-printer
# If missing: udev rules are not applied

# 4. Check device permissions
ls -la /dev/bus/usb/001/004
# Should be crw-rw-rw- (world readable/writable)

# 5. Check device inside the container
docker compose exec app ls -la /dev/thermavibe-printer
# If missing: Docker device passthrough is not configured correctly
```

**Solutions:**

1. **Printer not visible in `lsusb`:**
   - Check USB cable connections
   - Try a different USB port
   - Test the printer on another machine to rule out hardware failure
   - Check `dmesg | tail -20` for USB error messages

2. **Device permissions denied:**
   - Reload udev rules: `sudo udevadm control --reload-rules && sudo udevadm trigger`
   - Check that udev rule matches the vendor/product ID exactly: `sudo udevadm info -a -n /dev/bus/usb/001/004`
   - As a temporary fix: `sudo chmod 666 /dev/bus/usb/001/004`

3. **Device not visible inside container:**
   - Verify `devices` mapping in `docker-compose.yml` matches the device path
   - Restart container after changing device mapping: `docker compose restart app`
   - Check Docker daemon logs: `journalctl -u docker.service | tail -50`

4. **Printer detected but print fails:**
   - Check USB endpoint configuration: some printers require specific interface numbers
   - Verify `PRINTER_INTERFACE`, `PRINTER_IN_EP`, `PRINTER_OUT_EP` in `.env`
   - Test with python-escpos CLI: `docker compose exec app python -c "from escpos.printer import Usb; p = Usb(0x04b8, 0x0202); p.text('Test'); p.cut()"`

---

### Camera Not Detected

**Symptoms:**
- `GET /api/v1/camera/devices` returns empty array
- `GET /api/v1/camera/stream` returns 503 CAMERA_ERROR
- Photo capture fails during kiosk flow

**Diagnosis:**

```bash
# 1. Check if video device exists on the host
ls -la /dev/video*
# Should show /dev/video0 or higher

# 2. Check camera capabilities
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
# Should show supported resolutions and formats

# 3. Test camera capture on the host
ffmpeg -f video4linux2 -i /dev/video0 -frames 1 /tmp/test_capture.jpg
# If this fails, the camera or driver has an issue

# 4. Check device inside the container
docker compose exec app ls -la /dev/video0
# If missing: device passthrough is not configured

# 5. Check OpenCV access inside container
docker compose exec app python -c "
import cv2
cap = cv2.VideoCapture(0)
print(f'Camera opened: {cap.isOpened()}')
if cap.isOpened():
    ret, frame = cap.read()
    print(f'Frame captured: {ret}, shape: {frame.shape}')
    cap.release()
"
```

**Solutions:**

1. **No /dev/video* devices on host:**
   - Camera may not be connected or USB cable is faulty
   - Check `dmesg | grep -i "video\|uvc\|camera"` for driver errors
   - Install UVC driver: `sudo apt install v4l-utils`
   - Try a different USB port (USB 3.0 ports preferred)

2. **Permission denied on /dev/video0:**
   - Add the current user to the `video` group: `sudo usermod -aG video $USER`
   - Or configure Docker group_add: `group_add: ["video"]` in docker-compose.yml
   - As a temporary fix: `sudo chmod 666 /dev/video0`

3. **Camera works on host but not in container:**
   - Verify `devices` mapping includes the camera device
   - Add `group_add: ["video"]` to docker-compose.yml
   - Restart container: `docker compose restart app`

4. **MJPEG stream not working:**
   - Some cameras do not support MJPEG format natively; OpenCV may need to decode YUYV frames and re-encode to JPEG, which is slower
   - Force MJPEG format: `CAMERA_MJPEG_QUALITY=85` in `.env`
   - Lower the resolution: `CAMERA_RESOLUTION_WIDTH=640 CAMERA_RESOLUTION_HEIGHT=480`

---

### Payment Webhooks Not Arriving

**Symptoms:**
- Payment is confirmed in the payment gateway dashboard but kiosk remains on PAYMENT screen
- `GET /api/v1/payment/status/{session_id}` returns `PENDING` even after payment

**Diagnosis:**

```bash
# 1. Check if the webhook endpoint is accessible from the internet
curl -X POST https://your-public-url/api/v1/payment/webhook/midtrans \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Should return 400 (VALIDATION_ERROR) or 200, not connection refused

# 2. Check backend logs for webhook requests
docker compose logs app | grep -i "webhook\|payment"
# Look for incoming webhook requests

# 3. Verify webhook URL is configured in payment gateway dashboard
# Midtrans: Settings > Configuration > Payment Notification URL
# Xendit: Settings > Callback URLs

# 4. Test webhook delivery using ngrok (development only)
ngrok http 8000
# Use the ngrok URL as the webhook URL in the payment gateway dashboard
```

**Solutions:**

1. **Local development: Webhooks cannot reach localhost:**
   - Use ngrok: `ngrok http 8000` and configure the ngrok URL in the payment gateway
   - Alternatively, enable polling fallback: the frontend polls `GET /api/v1/payment/status/{session_id}` every 5 seconds as a fallback

2. **Production: Firewall blocking inbound traffic:**
   - Configure the firewall to allow inbound HTTPS on port 443
   - Set up a reverse proxy (nginx) that forwards `/api/v1/payment/webhook/*` to the backend
   - Use a domain with SSL certificate (Let's Encrypt)

3. **Webhook URL misconfigured:**
   - Verify the URL in the payment gateway dashboard includes the full path: `https://your-domain.com/api/v1/payment/webhook/midtrans`
   - Ensure the URL does not have a trailing slash

4. **Signature verification failing:**
   - Verify `MIDTRANS_SERVER_KEY` matches the key in the Midtrans dashboard
   - Check backend logs for signature verification errors
   - Temporarily disable signature verification for debugging (never in production)

---

### Chromium Not Starting in Kiosk Mode

**Symptoms:**
- Blank screen after boot
- Chromium launches but shows address bar or error page
- System boots to desktop instead of kiosk

**Diagnosis:**

```bash
# 1. Check if Chromium is installed
which chromium-browser || which chromium || which google-chrome

# 2. Test manual launch
chromium-browser --kiosk --noerrdialogs http://localhost:8000

# 3. Check X11 display server
echo $DISPLAY
# Should be :0

# 4. Check systemd service status
sudo systemctl status vibeprint-kiosk.service
sudo journalctl -u vibeprint-kiosk.service --since "5 minutes ago"

# 5. Check for GPU errors
chromium-browser --disable-gpu --kiosk http://localhost:8000
```

**Solutions:**

1. **Chromium not found:**
   - Install Chromium: `sudo apt install chromium-browser` (Ubuntu) or `sudo apt install chromium` (Debian)
   - If using a different browser, update `CHROMIUM_BIN` in the systemd service

2. **Display server not running:**
   - Start X11: `startx`
   - For headless testing, use Xvfb: `Xvfb :0 &`
   - Ensure auto-login is configured (see [Chromium Kiosk Launch](#4-chromium-kiosk-launch))

3. **GPU-related crashes:**
   - Add `--disable-gpu` to the Chromium launch flags
   - Add `--disable-software-rasterizer` and `--in-process-gpu` flags
   - Update GPU drivers: `sudo apt install mesa-vulkan-drivers`

4. **Error page instead of kiosk UI:**
   - Verify the backend is running: `curl http://localhost:8000/api/v1/health`
   - Check that the URL in the systemd service matches the backend port
   - Look for `--disable-infobars` flag to suppress Chrome error messages

5. **Chromium exits immediately:**
   - Check journalctl for crash logs
   - Try running as the kiosk user: `sudo -u kiosk-user chromium-browser --kiosk http://localhost:8000`
   - Check for profile lock: `rm -rf ~/.config/chromium/SingletonLock`

---

### Database Connection Refused

**Symptoms:**
- Backend logs show `ConnectionRefusedError` or `could not connect to server`
- Health check endpoint returns `checks.database: "unavailable"`
- All API endpoints return 500 errors

**Diagnosis:**

```bash
# 1. Check PostgreSQL container status
docker compose ps postgres
# Should show "Up" and "healthy"

# 2. Check PostgreSQL logs
docker compose logs postgres --tail 50
# Look for "database system is ready to accept connections"

# 3. Check if PostgreSQL is listening
docker compose exec postgres pg_isready -U thermavibe
# Should return: /var/run/postgresql:5432 - accepting connections

# 4. Test connection from app container
docker compose exec app python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine

async def test():
    engine = create_async_engine('postgresql+asyncpg://thermavibe:PASSWORD@postgres:5432/thermavibe')
    async with engine.connect() as conn:
        result = await conn.execute('SELECT 1')
        print('Connection successful:', result.scalar())
    await engine.dispose()

asyncio.run(test())
"

# 5. Check Docker network
docker network inspect vibeprint-net
# Verify both containers are on the same network
```

**Solutions:**

1. **PostgreSQL container not running:**
   - Start containers: `docker compose up -d`
   - Check for volume corruption: `docker volume inspect vibeprint-postgres-data`
   - If corrupted, restore from backup (see [Backup](#7-backup))

2. **Health check failing:**
   - PostgreSQL may need more time to start after a crash: increase `start_period` in healthcheck
   - Check for insufficient disk space: `df -h`
   - Check for insufficient memory: `free -m`

3. **Connection string mismatch:**
   - Verify `DATABASE_URL` in `.env` matches PostgreSQL container credentials
   - Ensure the hostname is `postgres` (Docker service name), not `localhost`
   - Verify `POSTGRES_PASSWORD` is identical in both the postgres environment and the app's DATABASE_URL

4. **Database not initialized:**
   - Run migrations: `docker compose exec app alembic upgrade head`
   - If Alembic fails, check that the database exists: `docker compose exec postgres psql -U thermavibe -l`

### General Debugging Commands

```bash
# View all container logs
docker compose logs -f

# View logs for a specific container
docker compose logs -f app
docker compose logs -f postgres

# Restart all containers
docker compose restart

# Restart a specific container
docker compose restart app

# Rebuild and restart
docker compose up -d --build

# Check container resource usage
docker stats

# Inspect Docker network
docker network inspect vibeprint-net

# Check disk usage
docker system df

# Clean up unused Docker resources (be careful)
docker system prune -f
```
