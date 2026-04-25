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
| `APP_SECRET_KEY` | Secret for JWT tokens and signatures | `dev-secret-key-change-in-production` |
| `APP_HOST` | Host to bind the backend | `0.0.0.0` |
| `APP_PORT` | Port to bind the backend | `8000` |
| `ADMIN_PIN` | Admin dashboard PIN code | `1234` |
| `ADMIN_SESSION_TTL_HOURS` | Admin session duration in hours before auto-logout | `24` |
| `LOG_LEVEL` | Logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) | `DEBUG` |

#### AI Provider Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `AI_PROVIDER` | Active AI provider (`openai`, `anthropic`, `google`, `ollama`, `mock`) | `mock` |
| `OPENAI_API_KEY` | OpenAI API key | (empty, not needed for mock) |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o` |
| `ANTHROPIC_API_KEY` | Anthropic API key | (empty) |
| `ANTHROPIC_MODEL` | Anthropic model name | `claude-sonnet-4-20250514` |
| `GOOGLE_API_KEY` | Google AI API key | (empty) |
| `GOOGLE_MODEL` | Google model name | `gemini-2.0-flash` |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://host.docker.internal:11434` |
| `OLLAMA_MODEL` | Ollama model name | `llava` |

#### Payment Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `PAYMENT_ENABLED` | Enable payment step in kiosk flow | `false` |
| `PAYMENT_PROVIDER` | Payment gateway (`midtrans`, `xendit`, `mock`) | `mock` |
| `MIDTRANS_SERVER_KEY` | Midtrans server key | (empty, use sandbox key from Midtrans dashboard) |
| `MIDTRANS_CLIENT_KEY` | Midtrans client key | (empty) |
| `MIDTRANS_IS_PRODUCTION` | Use Midtrans production environment | `false` |
| `XENDIT_SECRET_KEY` | Xendit secret key | (empty) |
| `XENDIT_IS_PRODUCTION` | Use Xendit production environment | `false` |

#### Printer Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `PRINTER_ENABLED` | Enable thermal printer support | `true` |
| `PRINTER_VENDOR_ID` | USB vendor ID (hex with 0x prefix) | `0x04b8` |
| `PRINTER_PRODUCT_ID` | USB product ID (hex with 0x prefix) | `0x0202` |
| `PRINTER_INTERFACE` | USB interface number | `0` |
| `PRINTER_IN_EP` | USB input endpoint | `0x81` |
| `PRINTER_OUT_EP` | USB output endpoint | `0x03` |
| `PRINTER_PROFILE` | Printer profile name | `default` |

#### Camera Configuration

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `CAMERA_ENABLED` | Enable camera support | `true` |
| `CAMERA_DEVICE_INDEX` | V4L2 device index (`/dev/videoN`) | `0` |
| `CAMERA_RESOLUTION_WIDTH` | Capture resolution width | `1280` |
| `CAMERA_RESOLUTION_HEIGHT` | Capture resolution height | `720` |
| `CAMERA_MJPEG_QUALITY` | JPEG compression quality (1-100) | `85` |

#### Photobooth Configuration

Photobooth settings are managed through the **Admin Dashboard** (`/admin`), not through environment variables. They are stored in the PostgreSQL database and take effect immediately.

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Photobooth | Toggle the photobooth feature on/off | Enabled |
| Capture Time Limit | Seconds users have to take photos | 30s |
| Max Photos | Maximum photos per session | 8 |
| Min Photos | Minimum photos before "Done" button appears | 2 |
| Default Layout Rows | Default photo slots in strip (1-4) | 4 |
| Watermark Enabled | Add text watermark to strips | Disabled |
| Watermark Text | Text shown on watermark | VibePrint OS |
| Composite Retention | Hours to keep strips for admin viewing | 168h (7 days) |

The `.env` values are only used as seed defaults when the database is first initialized. After that, all photobooth configuration is read from the database at runtime.

---

## 3. Start Database

Start only the PostgreSQL container for initial setup:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres
```

This command:
- Uses the base `docker-compose.yml` for the service definitions
- Applies `docker-compose.dev.yml` overrides (development environment variables, volume mounts)
- Starts only the `postgres` service in detached mode (`-d`)

Verify the database is running and healthy:

```bash
docker compose ps postgres
# Expected output: Status should show "healthy" (may take 5-10 seconds on first start)

docker compose logs postgres
# Expected output: "database system is ready to accept connections"
```

---

## 4. Run Migrations

Once PostgreSQL is healthy, run Alembic migrations to create the database schema:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend alembic upgrade head
```

This applies all pending migrations in order. On a fresh database, this creates all tables (sessions, payments, configs, devices).

If the backend container is not running yet, start it temporarily:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm backend alembic upgrade head
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
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d app
```

The backend:
- Starts on port 8000 inside the container
- Is accessible at `http://localhost:8000` from the host
- Mounts the backend source code for hot-reload (development override)
- Connects to PostgreSQL via the internal Docker network

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

#### 1. Identify the Printer

Connect the thermal printer via USB and identify its USB vendor ID and product ID:

```bash
lsusb
# Look for your printer, e.g.:
# Bus 001 Device 004: ID 04b8:0202 Seiko Epson Corp. TM-T20II
# Vendor ID: 04b8, Product ID: 0202
```

Update the `.env` file:

```bash
PRINTER_VENDOR_ID=0x04b8
PRINTER_PRODUCT_ID=0x0202
```

#### 2. Configure udev Rules (Linux)

Create a udev rule to give the Docker user read/write access to the printer without running as root:

```bash
sudo tee /etc/udev/rules.d/99-thermavibe-printer.rules << 'EOF'
# VibePrint OS thermal printer
SUBSYSTEM=="usb", ATTR{idVendor}=="04b8", ATTR{idProduct}=="0202", MODE="0666"
EOF

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger

# Verify permissions
ls -la /dev/bus/usb/001/004
# Should show crw-rw-rw- (world readable/writable)
```

#### 3. Pass USB Device to Docker Container

Update `docker-compose.yml` (or `docker-compose.dev.yml`) to pass the printer device:

```yaml
services:
  app:
    devices:
      - /dev/bus/usb/001/004:/dev/bus/usb/001/004
```

For a more robust approach, use the udev symlink:

```yaml
services:
  app:
    devices:
      - /dev/thermavibe-printer:/dev/thermavibe-printer
```

#### 4. Test the Printer

Use the admin API to print a test receipt:

```bash
# First, log in to get an admin token
curl -X POST http://localhost:8000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"pin": "1234"}'
# Response: {"token": "eyJ..."}

# Then, print a test receipt
curl -X POST http://localhost:8000/api/v1/print/test \
  -H "Authorization: Bearer eyJ..."
```

Alternatively, use the Swagger UI at http://localhost:8000/docs to test interactively.

#### 5. Check Printer Status

```bash
curl -X GET http://localhost:8000/api/v1/print/status \
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

#### 3. Pass Camera Device to Docker Container

```yaml
services:
  app:
    devices:
      - /dev/video0:/dev/video0
```

Ensure the Docker user has permission to access the video device. On Linux, the user must be in the `video` group:

```bash
# Check which group owns /dev/video0
ls -la /dev/video0
# Typically: crw-rw----+ 1 root video ...

# Add the Docker daemon user or use group mapping
# In docker-compose.yml:
services:
  app:
    group_add:
      - video
```

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
| `make dev` | Start full development environment (postgres + app + frontend dev server) |
| `make dev-backend` | Start only postgres + app (backend in Docker) |
| `make dev-frontend` | Start only frontend dev server (assumes backend is already running) |
| `make stop` | Stop all Docker containers |
| `make logs` | Tail logs from all running containers |
| `make logs-backend` | Tail backend logs |
| `make logs-db` | Tail PostgreSQL logs |

### Database

| Command | Description |
|---------|-------------|
| `make migrate` | Run pending Alembic migrations (`alembic upgrade head`) |
| `make migrate-create` | Generate a new migration (`alembic revision --autogenerate -m "message"`) |
| `make migrate-rollback` | Rollback last migration (`alembic downgrade -1`) |
| `make db-shell` | Open PostgreSQL shell (`psql`) |

### Testing

| Command | Description |
|---------|-------------|
| `make test` | Run all tests (backend + frontend) |
| `make test-backend` | Run backend tests with verbose output |
| `make test-frontend` | Run frontend tests |
| `make test-coverage` | Run backend tests with coverage report |
| `make test-integration` | Run only integration tests |

### Code Quality

| Command | Description |
|---------|-------------|
| `make lint` | Run all linters (Ruff for Python, ESLint for TypeScript) |
| `make lint-backend` | Run Ruff linter and formatter check |
| `make lint-frontend` | Run ESLint on frontend |
| `make format` | Auto-format code (Ruff format, Prettier) |
| `make typecheck` | Run TypeScript type checking (`tsc --noEmit`) |

### Production

| Command | Description |
|---------|-------------|
| `make build` | Build production Docker image |
| `make deploy` | Deploy production stack (`docker compose up -d`) |
| `make backup` | Backup PostgreSQL data to `backups/` directory |
| `make update` | Pull latest image and restart (`docker compose pull && docker compose up -d`) |

### Makefile Example

```makefile
.PHONY: dev dev-backend dev-frontend stop logs migrate test lint

# Development
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres app
	cd frontend && npm run dev

dev-backend:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres app

dev-frontend:
	cd frontend && npm run dev

stop:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Database
migrate:
	docker compose exec app alembic upgrade head

migrate-create:
	@read -p "Migration description: " desc; \
	docker compose exec app alembic revision --autogenerate -m "$$desc"

db-shell:
	docker compose exec postgres psql -U thermavibe -d thermavibe

# Testing
test:
	docker compose exec app python -m pytest tests/ -v
	cd frontend && npm test

test-backend:
	docker compose exec app python -m pytest tests/ -v

test-frontend:
	cd frontend && npm test

test-coverage:
	docker compose exec app python -m pytest tests/ --cov=app --cov-report=term-missing

# Code Quality
lint:
	docker compose exec app ruff check backend/app/
	cd frontend && npx eslint src/

lint-backend:
	docker compose exec app ruff check backend/app/

lint-frontend:
	cd frontend && npx eslint src/

format:
	docker compose exec app ruff format backend/app/
	cd frontend && npx prettier --write src/
```
