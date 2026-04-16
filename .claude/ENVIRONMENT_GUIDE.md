# Environment Guide — VibePrint OS

Environment definitions, verified commands, and agent behavior rules per environment.

---

## Environment Definitions

| Environment | Purpose | Characteristics |
|-------------|---------|-----------------|
| `development` | Local development and feature work | Debug mode on, verbose logging, hot reload, mock providers, no real external services required |
| `staging` | Pre-production validation | Mirrors production config, real sandboxed services, no debug mode |
| `production` | Live kiosk deployment | No debug, minimal logging, hardened config, real services and secrets |

The active environment is controlled by `APP_ENV` in `.env` (default: `development`).

---

## Agent Behavior by Environment

### In `development`
- Verbose logging acceptable and encouraged for debugging
- Debug ports and tools may be exposed
- Seed data scripts and fixtures may be run freely
- Hot reload and volume mounts expected in Docker Compose
- Mock AI and payment providers are the default
- `ADMIN_PIN` defaults to `1234` — do not treat as security issue
- Proceed with standard workflow — no extra confirmation needed

### In `staging` or `production`
- **Never** run destructive commands without explicit written confirmation from the user
- **Never** directly modify production config files or secrets
- Present a written plan before executing any change, migration, or destructive operation
- Flag explicitly when operating in a non-development context
- `APP_SECRET_KEY` and `ADMIN_PIN` must be changed from defaults
- Mock providers must not be active

---

## Verified Commands

### Development Environment

```bash
# Start full development environment (PostgreSQL + backend + frontend)
make dev

# Stop development environment
make dev-down

# Tail development logs
make dev-logs

# Run all tests (backend + frontend)
make test

# Run backend tests only (249 tests)
cd backend && python -m pytest tests/ -v

# Run frontend tests only (32 tests)
cd frontend && npm test

# Lint all code
make lint

# Lint backend with Ruff
cd backend && ruff check app/ tests/

# Lint frontend with ESLint
cd frontend && npm run lint

# Type check frontend
cd frontend && npx tsc --noEmit

# Run database migrations
cd backend && alembic upgrade head

# Create a new migration
cd backend && alembic revision --autogenerate -m "description"

# Start backend locally (without Docker)
cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Start frontend locally
cd frontend && npm run dev
```

### Environment Health Verification

```bash
# Verify backend is healthy
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy","version":"0.1.0","uptime_seconds":...}

# Verify PostgreSQL is accepting connections
make shell-db
# Then: SELECT 1;
```

### Docker Operations

```bash
# Production build
make build
# Or: docker compose build

# Start production environment
docker compose up -d

# Stop all containers
docker compose down

# Shell into backend container
make shell-backend

# Shell into database
make shell-db

# Clean everything (containers, volumes, artifacts)
make clean

# See all available commands
make help
```

---

## Docker Compose Environment Pattern

### Files
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Production configuration — PostgreSQL 16 + app |
| `docker-compose.dev.yml` | Development overrides — hot-reload, exposed ports, debug mode |

### Commands per Environment
```bash
# Development (production base + dev overrides)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Production
docker compose up -d

# Using Makefile (preferred)
make dev        # development
make build      # production build
```

### Services
| Service | Container | Port | Notes |
|---------|-----------|------|-------|
| PostgreSQL | `vibeprint-postgres` | 5432 (prod), 5433 (dev host) | Health check via `pg_isready` |
| Backend | `vibeprint-app` | 8000 (localhost only) | Hot-reload in dev |
| Frontend | Served by backend in prod, Vite dev server in dev | 5173 (dev only) | HMR in dev |

### Known Gotchas
- Dev environment exposes PostgreSQL on port **5433** (not 5432) to avoid conflicts with local PostgreSQL
- USB device passthrough requires `/dev/bus/usb` and `/dev/video0` to exist on the host
- The Dockerfile uses a multi-stage build (Node 20 for frontend build, Python 3.12 for runtime)

---

## `.env` File Pattern

| File | Committed | Purpose |
|------|-----------|---------|
| `.env.example` | Yes | All keys with placeholder values + comments — template for developers |
| `.env` | No | Actual development secrets — created from `.env.example` |
| `.env.staging` | No | Staging secrets (if applicable) |
| `.env.production` | No | Production secrets (if applicable) |

**Gitignore status:** `.env`, `.env.local`, and `.env.*.local` are properly excluded in `.gitignore`. The `.env.example` file is committed.

**Quick setup:**
```bash
cp .env.example .env
# Edit .env with actual values for your environment
```

---

## Local Development (Without Docker)

If you need to run without Docker Compose:

```bash
# 1. Start PostgreSQL (requires local installation or Docker)
docker run -d --name vibeprint-postgres \
  -e POSTGRES_DB=thermavibe \
  -e POSTGRES_USER=thermavibe \
  -e POSTGRES_PASSWORD=thermavibe \
  -p 5432:5432 \
  postgres:16-alpine

# 2. Update .env DATABASE_URL to point to localhost
# DATABASE_URL=postgresql+asyncpg://thermavibe:thermavibe@localhost:5432/thermavibe

# 3. Run migrations
cd backend && alembic upgrade head

# 4. Start backend
cd backend && uvicorn app.main:app --reload

# 5. Start frontend (in another terminal)
cd frontend && npm run dev
```
