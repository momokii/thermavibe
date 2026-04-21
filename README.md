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

- **Kiosk flow**: Idle → Payment (optional) → Capture → AI Processing → Reveal → Print → Reset
- **5 AI providers** with automatic fallback chain (OpenAI → Anthropic → Google → Ollama → Mock)
- **3 payment providers** (Midtrans, Xendit, Mock) — toggle-able, default OFF
- **Admin dashboard**: PIN-protected, real-time analytics, config management, hardware testing
- **Privacy-first**: photos and data are cleared after each session
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

## Production Mode

Production mode builds the frontend into static assets and serves everything from a single Docker container.

### 1. Clone and configure

```bash
git clone https://github.com/your-org/thermavibe.git
cd thermavibe

cp .env.example .env
# Edit .env with your production values:
#   - Set APP_ENV=production
#   - Set APP_SECRET_KEY to a strong random string
#   - Set ADMIN_PIN to a secure PIN
#   - Configure AI_PROVIDER and API keys
#   - Configure PAYMENT_ENABLED and payment provider keys
#   - Set printer USB VID/PID
```

### 2. Build and start

```bash
docker compose up --build -d
```

The Dockerfile runs a multi-stage build:
1. **Stage 1**: Builds frontend static assets with Node 20
2. **Stage 2**: Copies built assets into Python 3.12 runtime

On startup, the container automatically runs `alembic upgrade head` to apply migrations, then starts uvicorn.

### 3. Run migrations manually (if needed)

```bash
make migrate
```

### 4. Launch kiosk mode (on the kiosk machine)

```bash
bash scripts/start-kiosk.sh
```

This launches Chromium in fullscreen kiosk mode pointing at `http://localhost:8000`. You can override the URL:

```bash
KIOSK_URL=http://192.168.1.100:8000 bash scripts/start-kiosk.sh
```

### 5. Access the application

| URL | Description |
|-----|-------------|
| `http://localhost:8000` | Kiosk UI (production build) |
| `http://localhost:8000/admin` | Admin dashboard |
| `http://localhost:8000/docs` | API documentation |

### 6. Stop production

```bash
docker compose down
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

### Development

| Command | Description |
|---------|-------------|
| `make dev` | Start dev environment (Docker + hot-reload) |
| `make dev-down` | Stop dev environment |
| `make dev-logs` | Tail dev environment logs |

### Local Development (no Docker)

| Command | Description |
|---------|-------------|
| `make local-backend` | Run backend with hot-reload locally |
| `make local-migrate` | Run database migrations locally |
| `make local-migrate-create msg="desc"` | Create a new migration locally |
| `make local-test` | Run backend tests locally |
| `make local-lint` | Lint backend Python code locally |

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

## Environment Variables

All configuration is done via environment variables. Copy `.env.example` and edit:

```bash
cp .env.example .env
```

### Key variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | `development` or `production` |
| `AI_PROVIDER` | `openai` | AI provider: `openai`, `anthropic`, `google`, `ollama`, or `mock` |
| `PAYMENT_ENABLED` | `false` | Enable/disable payment flow |
| `PAYMENT_PROVIDER` | `mock` | Payment provider: `mock`, `midtrans`, or `xendit` |
| `PAYMENT_AMOUNT` | `5000` | Payment amount in IDR |
| `ADMIN_PIN` | `1234` | PIN for admin dashboard access |
| `ADMIN_SESSION_TTL_HOURS` | `24` | Admin session duration in hours before auto-logout |
| `PRINTER_VENDOR_ID` | `0x04b8` | USB vendor ID of thermal printer |
| `PRINTER_PRODUCT_ID` | `0x0e15` | USB product ID of thermal printer |
| `CAMERA_DEVICE_INDEX` | `0` | Camera device index (`/dev/video0` = 0) |

See `.env.example` for the complete list with descriptions.

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
│   │   ├── api/v1/endpoints/# REST API route handlers (6 modules, 24+ endpoints)
│   │   ├── core/            # Config, database, security, middleware, exceptions
│   │   ├── models/          # SQLAlchemy ORM models (5 tables)
│   │   ├── payment/         # Payment provider adapters (Midtrans, Xendit, Mock)
│   │   ├── schemas/         # Pydantic request/response schemas (9 modules)
│   │   ├── services/        # Business logic (7 services)
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
│   └── technical/           # Technical specs (8 documents)
├── scripts/                  # Operational scripts
├── config/                   # Static configuration and fallback templates
├── docker-compose.yml        # Production Docker Compose
├── docker-compose.dev.yml    # Development overrides
├── Dockerfile                # Multi-stage build (Node → Python)
├── Makefile                  # Development commands
└── .env.example              # Environment variable template
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

- **PaymentScreen**: The kiosk payment screen is a stub (empty `<div>`). Payment is disabled by default (`PAYMENT_ENABLED=false`), so this does not affect the core flow. Implementing the payment screen is the next priority.
- **No CI/CD pipeline**: No automated build/test/deploy pipeline yet.
- **No real hardware testing**: Camera and printer services are implemented but untested with actual hardware.
- **Test coverage**: Backend is well-tested (249 tests). Frontend has basic coverage (32 tests) — admin components and most hooks lack tests.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
