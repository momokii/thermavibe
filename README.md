# VibePrint OS

Open-source, hardware-agnostic kiosk software for AI-powered photobooths.

VibePrint OS turns a basic computer, a USB webcam, and a thermal receipt printer into a self-service "AI Vibe/Aura Booth." Users walk up, pay a micro-transaction (QRIS), get their photo taken, receive a witty AI-generated reading, and walk away with a physical thermal-printed receipt. Operators download the software, plug in hardware, and earn passive income.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12+ / FastAPI / SQLAlchemy 2.0 (async) / Alembic / PostgreSQL |
| **Frontend** | React 19 / TypeScript 5 (strict) / Vite 6 / Tailwind CSS 4 / shadcn/ui / Framer Motion / Zustand |
| **AI** | Provider-agnostic — OpenAI, Anthropic, Google Vision, Ollama (local), Mock |
| **Payment** | QRIS via Midtrans, Xendit, or Mock provider (development) |
| **Printer** | python-escpos for direct ESC/POS USB communication |
| **Camera** | OpenCV / V4L2 for USB webcam capture |
| **Deployment** | Docker Compose on Linux (Ubuntu/Debian) |

---

## Features

- **Dual features**: Vibe Check (single photo + AI reading) and Photobooth (multi-photo strip with themes)
- **5 AI providers** with automatic fallback chain (OpenAI, Anthropic, Google, Ollama, Mock)
- **3 payment providers** (Midtrans, Xendit, Mock) — toggle-able, default OFF
- **Access code system**: Generate codes for event-hosted kiosks (vibe check, photobooth, or universal), with pricing, batch generation, QR codes, and revocation
- **Admin dashboard**: PIN-protected with real-time analytics (sessions, revenue, feature breakdown, peak hours heatmap, drop-off funnel, print reliability), config management, hardware testing, theme editor, photo/strips gallery
- **Print template**: Configurable receipt footer (brand name, timezone, per-element toggles) applied consistently across all print types
- **Gallery**: Browse, view, and manually reprint Vibe Check results and Photobooth strips
- **Retention enforcement**: Configurable per-feature retention periods with automatic background cleanup
- **Privacy-first**: photos retained only for the configured retention period, then automatically purged
- **Hardware-agnostic**: any UVC webcam + any ESC/POS thermal printer

---

## Prerequisites

- **OS**: Linux (Ubuntu/Debian recommended)
- **Docker**: Docker Engine 24+ and Docker Compose v2
- **Hardware** (for production):
  - USB webcam (UVC-compliant)
  - ESC/POS-compatible thermal printer (USB)
- **API keys** (pick at least one):
  - OpenAI API key, or
  - Anthropic API key, or
  - Google Cloud Vision API key, or
  - Ollama running locally

---

## Development Mode

Development mode runs the backend in Docker with hot-reload and the frontend via Vite dev server (HMR).

### 1. Clone and configure

```bash
git clone https://github.com/your-org/thermavibe.git
cd thermavibe

cp .env.example .env
# Edit .env — at minimum set AI_PROVIDER=mock for testing without API keys
```

### 2. Start backend services (PostgreSQL + FastAPI)

```bash
make dev
```

This starts PostgreSQL and the FastAPI backend with hot-reload. The backend is available at `http://localhost:8000`.

### 3. Start the frontend dev server

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs at `http://localhost:5173` with HMR and auto-proxies `/api` requests to the backend.

### 4. Access the application

| URL | Description |
|-----|-------------|
| `http://localhost:5173` | Kiosk UI (Vite dev server) |
| `http://localhost:5173/admin` | Admin dashboard (PIN: `1234` by default) |
| `http://localhost:8000/docs` | Backend API documentation (Swagger) |
| `http://localhost:8000/health` | Health check endpoint |

### 5. Stop the development environment

```bash
make dev-down
```

---

## Production Deployment

Production mode builds the frontend into static assets and serves everything from a single Docker container. FastAPI serves both the API (`/api/v1/*`) and the frontend SPA.

### Quick deploy (recommended)

```bash
cp .env.production .env        # Copy production template
nano .env                       # Edit secrets (marked with [CHANGE ME])
make deploy                     # Build, start, and verify health
```

`make deploy` validates your `.env`, builds Docker images, starts containers, auto-detects connected cameras/printers, and waits for the health check to pass.

### Step-by-step deploy

#### 1. Clone and configure

```bash
git clone https://github.com/your-org/thermavibe.git
cd thermavibe

cp .env.production .env
```

Edit `.env` — values marked `[CHANGE ME]` must be set:

| Variable | How to generate |
|----------|----------------|
| `APP_SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ADMIN_PIN` | Choose a secure PIN |
| `POSTGRES_PASSWORD` | Choose a secure database password |

Also configure your AI provider and hardware settings.

#### 2. Build and start

```bash
make prod
```

This uses `scripts/start-docker.sh` which:
- Auto-detects connected cameras (`/dev/video*`) and USB printers
- Sets up USB permissions (udev rules)
- Builds a multi-stage Docker image (Node 20 frontend build + Python 3.12 runtime)
- Runs database migrations on startup (`alembic upgrade head`)

#### 3. Verify it's running

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","version":"0.1.0",...}
```

#### 4. Launch kiosk mode

```bash
bash scripts/start-kiosk.sh
```

Launches Chromium in fullscreen kiosk mode pointing at `http://localhost:8000`. Override the URL:

```bash
KIOSK_URL=http://192.168.1.100:8000 bash scripts/start-kiosk.sh
```

#### 5. Access the application

| URL | Description |
|-----|-------------|
| `http://localhost:8000` | Kiosk UI (production SPA) |
| `http://localhost:8000/admin` | Admin dashboard |
| `http://localhost:8000/docs` | API documentation |
| `http://localhost:8000/health` | Health check |

### Auto-start on boot (systemd)

Install the systemd service so VibePrint OS starts automatically when the kiosk machine boots:

```bash
# Adjust WorkingDirectory in the service file if needed
sudo cp deploy/thermavibe.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable thermavibe    # Start on boot
sudo systemctl start thermavibe     # Start now
```

Check status:

```bash
sudo systemctl status thermavibe
```

### Stop production

```bash
make dev-down
```

### Update to a new version

```bash
git pull
make prod
```

---

## Local Development (no Docker)

For backend development without Docker. Requires PostgreSQL running locally.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .

# Run migrations
alembic upgrade head

# Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use Makefile shortcuts:

```bash
make local-backend           # Run backend with hot-reload
make local-migrate           # Run migrations
make local-migrate-create msg="description"  # Create migration
make local-test              # Run tests
make local-lint              # Lint code
```

---

## Running Tests

### All tests

```bash
make test
```

### Backend tests only (249 tests)

```bash
# Inside Docker
make test-backend

# Or locally (requires .venv)
cd backend
python -m pytest tests/ -v
```

### Frontend tests only (32 tests)

```bash
make test-frontend

# Or directly
cd frontend
npm test
```

---

## Useful Commands

All commands are run from the repository root. Run `make help` for the full list.

### Deployment

| Command | Description |
|---------|-------------|
| `make deploy` | Validate env, build, start production, verify health |
| `make prod` | Start production mode (auto-detects hardware) |
| `make dev` | Start dev environment (Docker + hot-reload) |
| `make dev-down` | Stop all containers |
| `make dev-logs` | Tail dev environment logs |

### Testing & Quality

| Command | Description |
|---------|-------------|
| `make test` | Run all tests (backend + frontend) |
| `make test-backend` | Run backend tests |
| `make test-frontend` | Run frontend tests |
| `make lint` | Run all linters |
| `make lint-backend` | Lint backend with Ruff |
| `make lint-frontend` | Lint frontend with ESLint |

### Database

| Command | Description |
|---------|-------------|
| `make migrate` | Run pending migrations |
| `make migrate-down` | Rollback last migration |
| `make migrate-create msg="desc"` | Create a new migration |
| `make shell-db` | Open psql shell |

### Docker

| Command | Description |
|---------|-------------|
| `make build` | Build production Docker images |
| `make shell-backend` | Shell into backend container |
| `make logs` | Tail all container logs |
| `make clean` | Remove containers, volumes, and built artifacts |

---

## Configuration

VibePrint OS uses a **two-tier configuration system**:

1. **Environment variables** (`.env`) — deployment-time settings like secrets, database, hardware detection
2. **Database configs** (admin panel) — runtime settings like AI provider, payment, photobooth, printer hardware, kiosk timings

On first startup, runtime settings are **seeded** from env var defaults into the database. After that, operators change them via the admin panel — no redeployment needed.

```bash
# For development
cp .env.example .env

# For production
cp .env.production .env
```

### Environment variables (deployment-time)

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | `development` or `production` |
| `APP_SECRET_KEY` | (change me) | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `APP_DEBUG` | `true` | Debug mode (always `false` in production) |
| `LOG_LEVEL` | `INFO` / `WARNING` | Application log level (see below) |
| `DATABASE_URL` | (auto) | PostgreSQL connection string |
| `ADMIN_PIN` | `1234` | PIN for admin dashboard access |
| `ADMIN_SESSION_TTL_HOURS` | `24` | Admin session duration before auto-logout |
| `CAMERA_DEVICE_INDEX` | `0` | Camera device index (`/dev/video0` = 0, auto-detected at startup) |
| `PRINTER_AUTO_DETECT` | `true` | Auto-detect USB thermal printer |
| `PRINTER_HOTPLUG_INTERVAL_SECONDS` | `30` | How often to scan for newly plugged-in printers |

### Log Levels

Control verbosity with the `LOG_LEVEL` environment variable:

| Level | Dev Default | Prod Default | Use When |
|-------|-------------|--------------|----------|
| `DEBUG` | | | Troubleshooting specific issues |
| `INFO` | default | | Normal development — shows app events |
| `WARNING` | | default | Production — only warnings and errors |
| `ERROR` | | | Minimal output — only failures |
| `CRITICAL` | | | Silent except catastrophic failures |

Noisy third-party loggers (SQLAlchemy queries, uvicorn access logs) are always silenced to `WARNING+`.

### Admin panel settings (runtime, stored in database)

These are configured via the admin dashboard after deployment — no `.env` edits needed:

| Category | Settings |
|----------|----------|
| **AI** | Provider, API keys, model, system prompt, timeout |
| **Payment** | Enable/disable, provider (Midtrans/Xendit/Mock), amount, currency, timeout |
| **Printer Hardware** | USB vendor/product ID, paper width |
| **Camera** | Resolution |
| **Photobooth** | Enable, capture time, min/max photos, layout, watermark, retention |
| **Vibe Check** | Enable, system prompt, retention |
| **Kiosk UX** | Idle timeout, countdown, processing timeout, reveal duration |
| **Print Template** | Footer brand name, timezone, per-element toggles |
| **Access Codes** | Enable/disable access code mode |

See `.env.example` or `.env.production` for initial seed values.

---

## Architecture

```
                    ┌─────────────────────────────────────────┐
                    │            Kiosk Machine (Linux)         │
                    │                                         │
  ┌─────────────┐   │   ┌──────────┐    ┌──────────────────┐  │
  │ USB Webcam  ├───┼──►│  FastAPI  │    │  PostgreSQL 16   │  │
  └─────────────┘   │   │ Backend   │───►│  (Docker volume) │  │
                    │   │  :8000    │    └──────────────────┘  │
  ┌─────────────┐   │   └────┬─────┘                          │
  │ ESC/POS     ◄───┼───────┘    │                             │
  │ Printer     │   │            ▼                             │
  └─────────────┘   │   ┌──────────────────┐                  │
                    │   │  React Frontend   │                  │
                    │   │  (Chromium kiosk) │                  │
                    │   └──────────────────┘                  │
                    └─────────────────────────────────────────┘
                                       │
                         ┌─────────────┼─────────────┐
                         ▼             ▼             ▼
                    ┌─────────┐  ┌──────────┐  ┌─────────┐
                    │ OpenAI  │  │ Midtrans │  │ Ollama  │
                    │ Anthropic│  │ Xendit   │  │ (local) │
                    │ Google  │  │ (QRIS)   │  └─────────┘
                    └─────────┘  └──────────┘
```

- **Backend** owns all business logic. Frontend is a thin presentation layer.
- Frontend communicates with backend exclusively via REST API.
- Camera preview uses MJPEG stream served from backend.
- Payment webhooks come from the payment gateway to the backend.
- AI provider is swappable via config with automatic fallback chain.

---

## Project Structure

```
thermavibe/
├── backend/                  # FastAPI Python application
│   ├── app/
│   │   ├── ai/              # AI provider adapters (OpenAI, Anthropic, Google, Ollama, Mock)
│   │   ├── api/v1/endpoints/# REST API route handlers (7 modules, 40+ endpoints)
│   │   ├── core/            # Config, database, security, middleware, exceptions
│   │   ├── models/          # SQLAlchemy ORM models (8 tables)
│   │   ├── payment/         # Payment provider adapters (Midtrans, Xendit, Mock)
│   │   ├── schemas/         # Pydantic request/response schemas (11 modules)
│   │   ├── services/        # Business logic (15 services)
│   │   └── utils/           # Utilities (dithering, ESC/POS, image processing, validators)
│   ├── alembic/             # Database migrations
│   ├── tests/               # Unit + integration tests (249 tests)
│   └── pyproject.toml       # Python dependencies
├── frontend/                 # React TypeScript SPA
│   ├── src/
│   │   ├── api/             # API client + typed endpoint functions
│   │   ├── components/      # Kiosk screens + admin components + shadcn/ui
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Route page components
│   │   ├── stores/          # Zustand state stores
│   │   └── __tests__/       # Component, hook, and store tests (32 tests)
│   ├── package.json
│   └── vite.config.ts
├── docs/                     # Documentation
│   ├── prd/                 # Product requirements (9 documents)
│   └── technical/           # Technical specs (9 documents)
├── scripts/                  # Operational scripts
├── config/                   # Static configuration and fallback templates
├── deploy/                   # Production deployment (systemd service)
├── docker-compose.yml        # Production Docker Compose
├── docker-compose.dev.yml    # Development overrides
├── Dockerfile                # Multi-stage build (Node → Python)
├── Makefile                  # All commands (dev, prod, deploy, test, lint)
├── .env.example              # Development environment template
└── .env.production           # Production environment template
```

---

## Documentation

Full documentation is in the [`docs/`](docs/) directory:

### Product Requirements
- [Executive Summary](docs/prd/00-executive-summary.md)
- [Personas & Goals](docs/prd/01-personas-and-goals.md)
- [Functional Requirements](docs/prd/02-functional-requirements.md)
- [Non-Functional Requirements](docs/prd/03-nonfunctional-requirements.md)
- [User Flows](docs/prd/04-user-flows.md)
- [Data Models](docs/prd/05-data-models.md)
- [Integration Map](docs/prd/06-integration-map.md)
- [Out of Scope](docs/prd/07-out-of-scope.md)
- [Open Questions](docs/prd/08-open-questions.md)

### Technical
- [Architecture Overview](docs/technical/architecture-overview.md)
- [Tech Stack Decisions](docs/technical/tech-stack-decision-record.md)
- [Development Setup Guide](docs/technical/development-setup-guide.md)
- [API Contract](docs/technical/api-contract.md)
- [Docker Deployment Guide](docs/technical/docker-deployment-guide.md)
- [Coding Standards](docs/technical/coding-standards.md)
- [Testing Strategy](docs/technical/testing-strategy.md)

---

## Known Limitations

- **No CI/CD pipeline**: No automated build/test/deploy pipeline yet.
- **Test coverage**: Backend is well-tested (250+ tests). Frontend has basic coverage (32 tests) — admin components and most hooks lack tests.
- **Single kiosk**: Currently supports one kiosk instance per deployment. Multi-kiosk architecture is planned (see `docs/technical/multi-kiosk-architecture.md`).

---

## License

MIT License. See [LICENSE](LICENSE) for details.
