# VibePrint OS -- Development Setup Guide

> This document provides step-by-step instructions for setting up a local development environment for VibePrint OS. It covers prerequisites, environment configuration, backend and frontend startup, testing, and hardware integration testing.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone and Configure](#2-clone-and-configure)
3. [Start Database](#3-start-database)
4. [Run Migrations](#4-run-migrations)
5. [Start Backend](#5-start-backend)
6. [Install Frontend Dependencies](#6-install-frontend-dependencies)
7. [Start Frontend Dev Server](#7-start-frontend-dev-server)
8. [Verify Setup](#8-verify-setup)
9. [Running Tests](#9-running-tests)
10. [Hardware Testing](#10-hardware-testing)
11. [Quick Command Reference](#11-quick-command-reference)

---

## 1. Prerequisites

The following software must be installed on your development machine (Linux, macOS, or WSL2 on Windows).

| Software | Minimum Version | Purpose | Installation |
|----------|----------------|---------|-------------|
| **Docker Engine** | 24.0+ | Container runtime for PostgreSQL and backend | [docker.com/get-started](https://docs.docker.com/get-started/) |
| **Docker Compose** | v2.20+ | Multi-container orchestration | Included with Docker Desktop; `docker compose version` to verify |
| **Git** | 2.40+ | Version control | System package manager |
| **Node.js** | 20 LTS | Frontend build tooling and dev server | [nodejs.org](https://nodejs.org/) or `nvm install 20` |
| **npm** | 10+ (bundled with Node 20) | Package manager for frontend | Included with Node.js |
| **Python** | 3.12+ | Backend runtime (only needed for local non-Docker development) | [python.org](https://www.python.org/) or `pyenv install 3.12` |
| **make** | GNU Make 4.0+ | Command shortcuts | System package manager (`sudo apt install build-essential`) |

### Verify Prerequisites

Run the following commands to verify all prerequisites are installed:

```bash
docker --version          # Docker version 24.0.0+
docker compose version    # Docker Compose version v2.20.0+
git --version             # git version 2.40.0+
node --version            # v20.x.x
npm --version             # 10.x.x
python3 --version         # Python 3.12.x (optional, for local dev)
make --version            # GNU Make 4.x
```

### Platform-Specific Notes

**Linux (Ubuntu/Debian):**
```bash
# Install Docker Engine
sudo apt-get update
sudo apt-get install ca-certificates curl
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Log out and back in for group membership to take effect

# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Install make
sudo apt install build-essential
```

**macOS:**
```bash
# Install Docker Desktop (includes Docker Compose v2)
brew install --cask docker

# Install Node.js via nvm
brew install nvm
nvm install 20

# Install make
xcode-select --install
```

**Windows (WSL2):**
```bash
# Enable WSL2 with Ubuntu
wsl --install -d Ubuntu-22.04

# Inside WSL2, follow the Linux instructions above
# Note: Docker Desktop must be installed on Windows with WSL2 integration enabled
# Settings > Resources > WSL Integration > Enable for your Ubuntu distro
```

> **Hardware on WSL2:** `make dev` and `make prod` work in WSL2, but USB webcams and printers are **not** visible by default. To pass through hardware, install [usbipd-win](https://learn.microsoft.com/en-us/windows/wsl/connect-usb) on the Windows host, then attach devices from an Administrator PowerShell:
>
> ```powershell
> # List USB devices available for passthrough
> usbipd list
>
> # Attach a webcam or printer by bus ID
> usbipd attach --wsl --busid <BUSID>
> ```
>
> After attaching, `/dev/video*` and `/dev/bus/usb` appear inside WSL2 and `start-docker.sh` detects them automatically. Without usbipd-win, the app runs fully in **mock mode** (suitable for software development without hardware).

---

## 2. Clone and Configure

### Clone the Repository

```bash
git clone https://github.com/your-org/vibeprint-os.git thermavibe
cd thermavibe
```

### Create Environment File

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

Review and edit the `.env` file. The following table describes each variable:

#### Database Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `POSTGRES_DB` | PostgreSQL database name | `thermavibe` |
| `POSTGRES_USER` | PostgreSQL username | `thermavibe` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `thermavibe` |
| `DATABASE_URL` | Full async connection string for SQLAlchemy | `postgresql+asyncpg://thermavibe:thermavibe@postgres:5432/thermavibe` |

#### Application Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `APP_ENV` | Environment mode (`development`, `production`) | `development` |
| `APP_SECRET_KEY` | Secret for JWT tokens and signatures | `change-me-in-production` |
| `APP_DEBUG` | Enable debug mode | `true` |
| `APP_PORT` | Port exposed on the host | `8000` |
| `ADMIN_PIN` | Admin dashboard PIN code | `1234` |
| `ADMIN_SESSION_TTL_HOURS` | Admin session duration in hours before auto-logout | `24` |

#### AI Provider Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `AI_PROVIDER` | Active AI provider (`openai`, `anthropic`, `google`, `ollama`, `mock`) | `mock` |
| `AI_MODEL` | Model name for the selected provider | `gpt-4o` |
| `AI_SYSTEM_PROMPT` | System prompt shaping the vibe reading personality | `You are a witty vibe reader.` |
| `OPENAI_API_KEY` | OpenAI API key | (empty, not needed for mock) |
| `ANTHROPIC_API_KEY` | Anthropic API key | (empty) |
| `GOOGLE_API_KEY` | Google AI API key | (empty) |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://host.docker.internal:11434` |

#### Payment Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `PAYMENT_ENABLED` | Enable payment step in kiosk flow | `false` |
| `PAYMENT_PROVIDER` | Payment gateway (`midtrans`, `xendit`, `mock`) | `mock` |
| `MIDTRANS_SERVER_KEY` | Midtrans server key | (empty, use sandbox key from Midtrans dashboard) |
| `MIDTRANS_IS_PRODUCTION` | Use Midtrans production environment | `false` |
| `XENDIT_API_KEY` | Xendit API key | (empty) |
| `PAYMENT_AMOUNT` | Payment amount in IDR | `5000` |
| `PAYMENT_CURRENCY` | Payment currency code | `IDR` |
| `PAYMENT_TIMEOUT_SECONDS` | Payment session timeout in seconds | `120` |

#### Printer Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `PRINTER_VENDOR_ID` | USB vendor ID (hex with 0x prefix) -- fallback if auto-detection fails | `0x04b8` |
| `PRINTER_PRODUCT_ID` | USB product ID (hex with 0x prefix) -- fallback if auto-detection fails | `0x0e15` |
| `PRINTER_PAPER_WIDTH` | Paper width in dots | `384` |
| `PRINTER_AUTO_DETECT` | Auto-detect printer via USB enumeration on startup | `true` |
| `PRINTER_HOTPLUG_INTERVAL_SECONDS` | Interval for background hot-plug scanner (seconds) | `30` |

#### Camera Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `CAMERA_DEVICE_INDEX` | V4L2 device index (`/dev/videoN`) | `0` |
| `CAMERA_RESOLUTION_WIDTH` | Capture resolution width | `1280` |
| `CAMERA_RESOLUTION_HEIGHT` | Capture resolution height | `720` |

#### Kiosk Behavior Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `KIOSK_IDLE_TIMEOUT_SECONDS` | Seconds before idle screen resets | `10` |
| `KIOSK_CAPTURE_COUNTDOWN_SECONDS` | Countdown before photo capture | `3` |
| `KIOSK_PROCESSING_TIMEOUT_SECONDS` | AI processing timeout | `60` |
| `KIOSK_REVEAL_DISPLAY_SECONDS` | Seconds to display result before auto-reset | `10` |

#### Photobooth Configuration

Photobooth settings are managed through the **Admin Dashboard** (`/admin`), stored in the PostgreSQL database, and take effect immediately. The `.env` values below are used as seed defaults when the database is first initialized.

| Setting | Env Variable | Default |
|---------|-------------|---------|
| Enable Photobooth | `PHOTOBOOTH_ENABLED` | `true` |
| Capture Time Limit | `PHOTOBOOTH_CAPTURE_TIME_LIMIT_SECONDS` | `30` |
| Max Photos | `PHOTOBOOTH_MAX_PHOTOS` | `8` |
| Min Photos | `PHOTOBOOTH_MIN_PHOTOS` | `2` |
| Default Layout Rows | `PHOTOBOOTH_DEFAULT_LAYOUT_ROWS` | `4` |
| Watermark Enabled | `PHOTOBOOTH_WATERMARK_ENABLED` | `false` |
| Watermark Text | `PHOTOBOOTH_WATERMARK_TEXT` | `VibePrint OS` |
| Composite Retention | `PHOTOBOOTH_COMPOSITE_RETENTION_HOURS` | `168` |
| Share URL TTL | `PHOTOBOOTH_SHARE_URL_TTL_SECONDS` | `300` |

After initial seeding, all photobooth configuration is read from the database at runtime and can be changed via the admin dashboard.

#### Vibe Check Configuration

Vibe Check settings are also managed through the **Admin Dashboard** (`/admin`).

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Vibe Check | Toggle the Vibe Check feature on/off | Enabled |
| Result Retention | Hours to keep vibe check results for admin gallery | 168h (7 days) |

#### Retention and Cleanup

The system automatically manages file retention for both features:

- **Retention periods** are configured per-feature in the admin dashboard (in hours). A value of 0 means keep forever.
- **Background cleanup** starts on app boot and runs periodically, purging expired files.
- **Cleanup interval** is auto-derived from the shorter of the two retention periods -- no separate cleanup schedule to configure.
- **Photo preservation**: After session completion, result files (vibe check photos and photobooth composites) are moved to a persistent Docker volume (`app-composites` mounted at `/tmp/vibeprint/`) so they survive container restarts and are available in the admin gallery.

#### CORS and Rate Limiting

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:5173,http://localhost:8000` |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests per window | `60` |
| `RATE_LIMIT_WINDOW_SECONDS` | Rate limit window in seconds | `60` |

#### Access Code Configuration

Access code mode provides a payment alternative for event-hosted kiosks. When enabled, users enter pre-generated codes instead of paying.

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Access Code Mode | Replace payment with code-based entry | Disabled |

Access code mode and payment mode are **mutually exclusive** — enabling one automatically disables the other. Codes are managed via the **Admin Dashboard** (`/admin/access-codes`): generate, revoke, delete, and view QR codes.

---

## 3. Start Database

Start only the PostgreSQL container for initial setup:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

This command:
- Uses the base `docker-compose.yml` for the service definitions
- Applies `docker-compose.dev.yml` overrides (dev container names, volume mounts)
- Starts only the `postgres` service in detached mode (`-d`)

In dev mode, Postgres is exposed on host port **5433** (to avoid conflicting with any local Postgres on 5432).

Verify the database is running and healthy:

```bash
docker compose ps postgres
# Expected output: Status should show "healthy" (may take 5-10 seconds on first start)

docker compose logs postgres
# Expected output: "database system is ready to accept connections"
```

---

## 4. Run Migrations

In **development mode**, migrations run automatically on startup. The `docker-compose.dev.yml` command is:

```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

So when you run `make dev` (or `./scripts/start-docker.sh dev`), the backend container runs migrations before starting the server. No manual migration step is required in dev mode.

For **production mode**, migrations also run automatically on startup via the Dockerfile entrypoint. To run migrations manually (e.g., against a running container):

```bash
make migrate
```

Verify the tables were created:

```bash
docker compose exec postgres psql -U thermavibe -d thermavibe -c "\dt"
# Expected output: List of tables including sessions, payments, configs, devices
```

### Creating a New Migration

After modifying SQLAlchemy models in `backend/app/models/`, generate a new migration:

```bash
docker compose exec app alembic revision --autogenerate -m "description_of_change"
```

Review the generated file in `backend/alembic/versions/` before applying it.

---

## 5. Start Backend

Start the backend application (FastAPI + static frontend files):

```bash
make dev
```

Or manually:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d app
```

The backend:
- Starts on port 8000 inside the container, accessible at `http://localhost:8000` from the host
- Runs `alembic upgrade head` automatically before starting (dev mode only)
- Mounts the backend source code (`./backend/app`) for hot-reload (development override)
- Connects to PostgreSQL via the internal Docker network
- Auto-detects cameras and passes them to the container via a temporary compose override

Verify the backend is running:

```bash
docker compose logs app --tail 20
# Expected output: "Uvicorn running on http://0.0.0.0:8000"
# Also check: "Application startup complete"

curl http://localhost:8000/api/v1/health
# Expected response: {"status": "ok"}
```

---

## 6. Install Frontend Dependencies

Open a new terminal and install the frontend npm packages:

```bash
cd frontend
npm install
```

This installs all dependencies listed in `frontend/package.json`, including React, Vite, Tailwind CSS, shadcn/ui dependencies, Framer Motion, Zustand, React Query, and development tooling (ESLint, Prettier, Vitest, TypeScript).

---

## 7. Start Frontend Dev Server

Start the Vite development server with Hot Module Replacement (HMR):

```bash
cd frontend
npm run dev
```

The Vite dev server:
- Starts on port 5173 by default
- Provides HMR: changes to React components, styles, and TypeScript files are reflected instantly without a full page reload
- Proxies API requests from `/api` to the backend at `http://localhost:8000` (configured in `vite.config.ts`)

Expected output:
```
  VITE v6.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
  ➜  press h + enter to show help
```

### Vite Proxy Configuration

The `vite.config.ts` includes a proxy rule that forwards API requests during development:

```typescript
// frontend/vite.config.ts
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/camera': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

This means frontend API calls to `/api/v1/kiosk/session` are proxied to `http://localhost:8000/api/v1/kiosk/session` during development, avoiding CORS issues.

---

## 8. Verify Setup

Once both backend and frontend are running, verify the complete setup:

### Frontend (Kiosk UI)

Open a browser and navigate to:

- **Kiosk UI**: http://localhost:5173
  - You should see the IDLE screen with a "Start" button
  - The AI provider is set to `mock`, so the full flow will work without real API keys

- **Admin Dashboard**: http://localhost:5173/admin
  - Log in with the PIN from `.env` (default: `1234`)

### Backend (API Documentation)

Open a browser and navigate to:

- **Swagger UI**: http://localhost:8000/docs
  - Interactive API documentation generated by FastAPI
  - You can test all endpoints directly from the browser

- **ReDoc**: http://localhost:8000/redoc
  - Alternative API documentation format

### Health Check

```bash
curl http://localhost:8000/api/v1/health
# Response: {"status": "ok", "version": "0.1.0", "environment": "development"}
```

---

## 9. Running Tests

### Backend Tests

Run all backend tests inside the Docker container:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python -m pytest tests/ -v
```

Run a specific test file:

```bash
docker compose exec app python -m pytest tests/unit/test_kiosk_service.py -v
```

Run tests with coverage report:

```bash
docker compose exec app python -m pytest tests/ --cov=app --cov-report=term-missing --cov-report=html
```

The HTML coverage report is written to `backend/htmlcov/index.html`.

Run only unit tests (fast, no database):

```bash
docker compose exec app python -m pytest tests/unit/ -v
```

Run only integration tests (requires test database):

```bash
docker compose exec app python -m pytest tests/integration/ -v
```

### Frontend Tests

Run all frontend tests:

```bash
cd frontend
npm test
```

Run tests in watch mode (re-runs on file changes):

```bash
cd frontend
npm test -- --watch
```

Run tests with coverage report:

```bash
cd frontend
npm test -- --coverage
```

Run tests for a specific component:

```bash
cd frontend
npm test -- IdleScreen
```

### Run All Tests

From the project root, run both backend and frontend tests:

```bash
make test
```

This runs backend tests in Docker and frontend tests locally in parallel.

---

## 10. Hardware Testing

### Thermal Printer Setup

#### 1. Connect and Auto-Detect

Connect the thermal printer via USB. Run the startup script:

```bash
./scripts/start-docker.sh dev
```

The printer is auto-detected on startup via pyusb USB device enumeration. The startup script handles USB permissions automatically by installing a broad udev rule that covers all USB devices. No manual `lsusb`, `.env` editing, or per-device udev rule creation is needed.

Printers can be connected or disconnected at any time without restart. A background hot-plug scanner checks for newly connected printers every 30 seconds.

#### 2. Test the Printer

Use the admin API to print a test receipt and verify the printer is working:

```bash
# First, log in to get an admin token
curl -X POST http://localhost:8000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'
# Response: {"token": "eyJ..."}

# Then, print a test receipt
curl -X POST http://localhost:8000/api/v1/printer/test \
  -H "Authorization: Bearer eyJ..."
```

Alternatively, use the Swagger UI at http://localhost:8000/docs to test interactively.

#### 3. Check Printer Status

```bash
curl -X GET http://localhost:8000/api/v1/printer/status \
  -H "Authorization: Bearer eyJ..."
# Response: {"connected": true, "vendor": "Epson", "model": "TM-T20II"}
```

### Camera Setup

#### 1. Verify Camera Detection

```bash
# List video devices
ls -la /dev/video*
# Should show /dev/video0 (or higher index)

# Check camera capabilities
v4l2-ctl --list-devices
v4l2-ctl -d /dev/video0 --list-formats-ext
# Should show MJPEG and/or YUYV formats
```

#### 2. Configure Camera in .env

```bash
CAMERA_DEVICE_INDEX=0
CAMERA_RESOLUTION_WIDTH=1280
CAMERA_RESOLUTION_HEIGHT=720
CAMERA_MJPEG_QUALITY=85
```

#### 3. Camera Device Passthrough (Automatic)

Camera devices are automatically detected and passed through by the startup script. No manual device mapping is needed in `docker-compose.yml`.

```bash
# Start development with automatic camera detection
make dev
# or
./scripts/start-docker.sh dev
```

The `scripts/start-docker.sh` script automatically:
- Detects all connected `/dev/video*` devices at startup
- Creates a temporary compose override with only the devices that exist
- Passes them to the container without crashing if no camera is present
- Falls back to mock mode if no cameras are connected

You can verify the camera was detected by checking the startup output:

```
 Camera:  ✓  Found 2 device(s):
          • /dev/video0
          • /dev/video1
```

> **Note:** The Dockerfile already adds the `vibeprint` user to the `video` group, so no additional group mapping is needed. If you encounter permission issues, ensure the host user is in the `video` group: `sudo usermod -aG video $USER`.

#### 4. Test the Camera

Open the camera MJPEG stream in a browser:

```
http://localhost:8000/api/v1/camera/stream
```

Or list available cameras:

```bash
curl http://localhost:8000/api/v1/camera/devices
# Response: [{"index": 0, "name": "USB Camera", "resolution": "1280x720"}]
```

Test a camera capture via the admin API:

```bash
curl -X POST http://localhost:8000/api/v1/admin/hardware/camera/test \
  -H "Authorization: Bearer eyJ..."
# Response: {"success": true, "image_size": 45231}
```

### Mock Payment Provider

For development and testing, use the mock payment provider. Set the following in `.env`:

```bash
PAYMENT_ENABLED=true
PAYMENT_PROVIDER=mock
```

The mock provider simulates the full payment flow:
- `POST /api/v1/payment/create-qr` returns a fake QR code URL that displays a placeholder image
- The payment is automatically confirmed after 5 seconds (simulating a webhook callback)
- `GET /api/v1/payment/status/{session_id` returns the simulated status

To test the real Midtrans sandbox:
1. Create a Midtrans Sandbox account at https://dashboard.sandbox.midtrans.com
2. Copy the Server Key and Client Key to `.env`:
   ```bash
   PAYMENT_PROVIDER=midtrans
   MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxx
   MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxx
   MIDTRANS_IS_PRODUCTION=false
   ```
3. For webhook testing, use ngrok to expose your local backend:
   ```bash
   ngrok http 8000
   # Set the ngrok URL as MIDTRANS_WEBHOOK_URL in .env
   ```

---

## 11. Quick Command Reference

The project `Makefile` provides shortcuts for common operations. All commands are run from the project root.

### Development

| Command | Description |
|---------|-------------|
| `make dev` | Start full dev environment with automatic camera detection |
| `make prod` | Start production mode with automatic camera detection |
| `make dev-down` | Stop all containers |
| `make dev-logs` | Tail development environment logs |

### Database

| Command | Description |
|---------|-------------|
| `make migrate` | Run pending Alembic migrations (`alembic upgrade head`) |
| `make migrate-down` | Rollback last migration (`alembic downgrade -1`) |
| `make migrate-create` | Generate a new migration (`alembic revision --autogenerate -m "message"`) |

### Testing

| Command | Description |
|---------|-------------|
| `make test` | Run all tests (backend + frontend) |
| `make test-backend` | Run backend tests with verbose output |
| `make test-frontend` | Run frontend tests |

### Code Quality

| Command | Description |
|---------|-------------|
| `make lint` | Run all linters (Ruff for Python, ESLint for TypeScript) |
| `make lint-backend` | Run Ruff linter |
| `make lint-frontend` | Run ESLint on frontend |

### Local Development (no Docker)

| Command | Description |
|---------|-------------|
| `make local-backend` | Run backend with hot-reload locally |
| `make local-migrate` | Run database migrations locally |
| `make local-migrate-create msg="desc"` | Create a new migration locally |
| `make local-test` | Run backend tests locally |
| `make local-lint` | Lint backend Python code locally |

### Shell and Utilities

| Command | Description |
|---------|-------------|
| `make shell-backend` | Open a shell in the backend container |
| `make shell-db` | Open PostgreSQL shell (`psql`) |
| `make logs` | Tail all container logs |
| `make build` | Build production Docker images |
| `make clean` | Remove all Docker containers, volumes, and built artifacts |

### Production

| Command | Description |
|---------|-------------|
| `make prod` | Start production with auto camera detection |
| `make build` | Build production Docker image |
| `./scripts/start-docker.sh down` | Stop all containers |

### Makefile Example

```makefile
.PHONY: dev prod dev-down test lint migrate

# Development (auto-detects cameras)
dev:
	./scripts/start-docker.sh dev

prod:
	./scripts/start-docker.sh prod

dev-down:
	./scripts/start-docker.sh down

dev-logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Database
migrate:
	docker compose exec app alembic upgrade head

migrate-down:
	docker compose exec app alembic downgrade -1

# Testing
test:
	docker compose exec app python -m pytest tests/ -v
	cd frontend && npm test

# Code Quality
lint:
	docker compose exec app ruff check app/ tests/
	cd frontend && npm run lint
```
