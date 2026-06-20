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
- **Digital sharing**: opt-in public share URLs via Cloudflare Tunnel sidecar — customers scan a QR on the photobooth reveal screen and get a mobile-friendly landing page with a Download button. Works on mobile data, not just same-WiFi. See [Digital Sharing](#digital-sharing-optional) below.
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

- **OS**: Linux (Ubuntu/Debian recommended). Windows supported via WSL2 (hardware passthrough requires [usbipd-win](https://learn.microsoft.com/en-us/windows/wsl/connect-usb))
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
make prod-down
```

### Update to a new version

```bash
git pull
make prod
```

For a clean rebuild (removes stale Docker images):

```bash
git pull
make prod-restart
```

---

## Digital Sharing (optional)

By default, the photobooth reveal screen shows a QR code whose URL only works on the kiosk's own browser — Docker binds the app port to `127.0.0.1`, so even a phone on the same WiFi cannot reach it. Digital Sharing fixes this: customers scan the QR, land on a mobile-friendly page with a Download button, and save the photo to their camera roll.

**Default behavior is unchanged when the feature is off.** No env vars need to be set; `make prod` behaves identically to before.

### Pick an approach

| Approach | Works on mobile data? | Needs internet? | Best for |
|---|---|---|---|
| **A1. Fresh Cloudflare Tunnel** | Yes | Yes | Most operators — set it up once, works everywhere |
| **A2. Reuse existing Cloudflare Tunnel** | Yes | Yes | You already run cloudflared on the host (e.g. for SSH) |
| **B. LAN-only fallback** | No (same WiFi only) | No | Offline events, no Cloudflare account |

A1 and A2 are recommended. B is a fallback for venues with no internet.

---

### Option A1: Fresh Cloudflare Tunnel setup (~15 min)

**Prerequisites:** a domain managed by Cloudflare (DNS hosted there). If your DNS is elsewhere, migrate it first — it's free.

**Step 1 — Create the tunnel:**

1. Open [https://one.dash.cloudflare.com/](https://one.dash.cloudflare.com/) → **Networks → Tunnels → Create a tunnel**
2. Connector type: **Cloudflared**
3. Name it (e.g. `vibeprint-kiosk`)
4. On the install page, pick the **Docker** tab and copy the token from the `environment: TUNNEL_TOKEN: ...` line of the displayed command. You don't need to run their `docker run` command — our sidecar handles that.

**Step 2 — Configure the public hostname:**

Still in the tunnel config, open the **Public Hostnames** tab → **Add a public hostname**:

| Field | Value |
|---|---|
| Subdomain | whatever you want (e.g. `kiosk`) |
| Domain | your domain (auto-selected) |
| Path | (leave blank) |
| Service Type | `HTTP` |
| Service URL | `app:8000` (Docker service name + internal port — the cloudflared sidecar reaches the app via the Docker network) |

Cloudflare auto-creates the DNS record since the domain is hosted there.

**Step 3 — Configure `.env`:**

```bash
PUBLIC_BASE_URL=https://kiosk.yourdomain.com
TUNNEL_TOKEN=<paste the token from step 1>
```

Share landing page branding (cafe name, social handle, accent color) is **not** in `.env` — configure it at `/admin/sharing` after first boot.

**Step 4 — Start with the tunnel profile:**

```bash
make prod-tunnel
```

This is identical to `make prod` but sets `COMPOSE_PROFILES=tunnel`, which starts the cloudflared sidecar alongside the app.

**Step 5 — Verify the sidecar is healthy:**

```bash
docker compose --profile tunnel ps
# Expected: vibeprint-app = running, cloudflared = running (not restarting)
```

If cloudflared shows `restarting`, the token is wrong or copy-paste got mangled. Check with `docker compose logs cloudflared`.

---

### Option A2: Reuse an existing Cloudflare Tunnel (~5 min)

If you already run cloudflared on the host (e.g. for SSH access to the kiosk machine), **do not** start a second cloudflared — two processes with the same token will fight each other and flap. Instead, add a hostname to your existing tunnel.

**Step 1 — Add a public hostname to your existing tunnel:**

In the Cloudflare dashboard, open your existing tunnel → **Public Hostnames** tab → **Add a public hostname**:

| Field | Value |
|---|---|
| Subdomain | e.g. `kiosk` |
| Domain | your domain |
| Service Type | `HTTP` |
| Service URL | `localhost:8000` (host cloudflared reaches the app via the host's loopback, where Docker publishes the port) |

**Step 2 — Configure `.env`:**

```bash
PUBLIC_BASE_URL=https://kiosk.yourdomain.com
# TUNNEL_TOKEN stays UNSET — you're not using the sidecar
```

**Step 3 — Start normally:**

```bash
make prod    # NOT make prod-tunnel
```

The host cloudflared routes both SSH (existing) and the kiosk (new) through one tunnel.

---

### Option B: LAN-only fallback (~2 min, no internet needed)

For venues with no internet (conferences, remote locations). Phones must be on the **same WiFi** as the kiosk. Phones on mobile data still won't work.

**Step 1 — Find the kiosk's LAN IP:**

```bash
ip -4 addr show | grep "inet " | grep -v 127.0.0.1
# e.g. 192.168.1.50
```

**Step 2 — Configure `.env`:**

```bash
BIND_HOST=0.0.0.0    # exposes the port on all interfaces (was 127.0.0.1)
# PUBLIC_BASE_URL stays UNSET — frontend prepends window.location.origin,
# which the phone resolves to the LAN IP it scanned the QR from.
```

**Step 3 — Restart and test:**

```bash
make prod
# Run a photobooth session on the kiosk, scan the QR with a phone on the same WiFi.
```

⚠️ **Security caveat:** `BIND_HOST=0.0.0.0` exposes the entire app — including `/admin` — to anyone on the LAN. The 4-digit admin PIN is the only barrier. Use only on trusted networks (your home, a private event), never on shared public WiFi. Switch back to `BIND_HOST=127.0.0.1` when the event is over.

---

### Verifying it works

After setting up any of the three options, walk through this checklist:

1. **Walk through a photobooth session** on the kiosk to reach the reveal screen (QR code visible).
2. **Scan the QR with a phone:**
   - Option A1/A2: turn off WiFi on the phone first (use mobile data only) — this is the real test
   - Option B: keep the phone on the same WiFi
3. **The landing page should render** — shows the photo preview, a Download button, and your branding.
4. **Tap Download.** On Android Chrome the image saves to Downloads. On iOS Safari the `<a download>` attribute may not save cross-origin — if it doesn't, long-press the image → "Save to Photos" (the page has a hint for this).
5. **Check analytics fired:**

```bash
docker compose exec postgres psql -U thermavibe -c \
  "SELECT event_type, count(*) FROM analytics_events \
   WHERE event_type IN ('share_url_scanned','composite_downloaded') GROUP BY 1;"
```

Both rows should appear after one scan + one download.

6. **Test an expired link** (optional): wait 5+ minutes after generating a share URL (default TTL is 300s), then re-open it. You should see a friendly "This link has expired" page (HTTP 410), not a JSON error.

---

### Quick URL-plumbing sanity check (no Cloudflare account needed)

Want to verify the URL plumbing without setting up a tunnel? Temporarily set `PUBLIC_BASE_URL=https://example.com` in `.env`, restart with `make prod`, run a photobooth session, and inspect the QR code's value (e.g. via the browser devtools on the kiosk, or by scanning with any phone). It should encode `https://example.com/api/v1/kiosk/share/...` — not `localhost`. Then unset it.

---

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `cloudflared` container shows status `restarting` | Wrong `TUNNEL_TOKEN` | Re-copy token from Cloudflare dashboard; check `docker compose logs cloudflared` for the auth error |
| Scanning the QR loads a Cloudflare 502 page | Public hostname service URL is wrong | For sidecar: must be `app:8000` (Docker DNS). For host cloudflared: must be `localhost:8000` |
| Scanning the QR loads a Cloudflare "not found" page | DNS hasn't propagated | Wait 1-2 min after creating the hostname, then retry |
| QR code still encodes `localhost` | `PUBLIC_BASE_URL` not set, or app not restarted | Verify `.env` has `PUBLIC_BASE_URL=https://...`, then `make prod-tunnel` (or `make prod`) again |
| Landing page loads but image 404s | Composite image purged by retention service | Default retention is 7 days. If the session is older, the image is gone — generate a fresh share URL from a new session |
| Download button opens image in new tab instead of saving (iOS) | iOS Safari `<a download>` limitation for cross-origin URLs | Long-press the image → "Save to Photos". Page already has a hint for this. No code fix possible. |
| Two cloudflared processes fighting (intermittent disconnects) | Both sidecar and host cloudflared running with same token | Pick one. Either stop the host cloudflared and use `make prod-tunnel`, or remove `TUNNEL_TOKEN` from `.env` and use the host cloudflared (Option A2) |

---

### Alternatives to Cloudflare Tunnel (not recommended)

If you can't or don't want to use Cloudflare Tunnel:

- **Tailscale Funnel** — similar outbound-only model, free tier, slightly simpler setup if you already use Tailscale. Not documented here; the plumbing (`PUBLIC_BASE_URL`) is the same.
- **ngrok** — works but free tier uses random URLs that change on restart (breaks QR codes generated before the restart). Paid tier needed for stable URLs.
- **Port forwarding on the kiosk router** — opens an inbound port, requires dynamic DNS if the kiosk has a residential connection, exposes the app to internet attacks. The admin PIN is too weak for this. **Don't.**

The `PUBLIC_BASE_URL` env var works with any of these — set it to whatever public URL fronts your kiosk.

---

For the full deep-dive (architecture diagrams, the loopback-only default rationale, iOS Safari background, decision records D-026 through D-029), see [`docs/technical/docker-deployment-guide.md` §2.5](docs/technical/docker-deployment-guide.md) and [`docs/technical/update-roadmap.md` §5](docs/technical/update-roadmap.md).

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

### Backend tests only (322 tests)

```bash
# Inside Docker
make test-backend

# Or locally (requires .venv)
cd backend
python -m pytest tests/ -v
```

### Frontend tests only (36 tests)

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
| `make prod-tunnel` | Start production with Cloudflare Tunnel sidecar (digital sharing) |
| `make prod-down` | Stop production containers |
| `make prod-restart` | Full clean restart: down, remove images, rebuild from scratch |
| `make dev` | Start dev environment (Docker + hot-reload) |
| `make dev-tunnel` | Start dev environment with Cloudflare Tunnel (digital sharing) |
| `make dev-down` | Stop all containers |
| `make dev-restart` | Full clean restart: down, remove images, rebuild from scratch |
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

Only these need to be set in `.env`. All other settings have sensible defaults and are managed via the admin panel after first run.

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | `development` or `production` |
| `APP_SECRET_KEY` | (change me) | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `APP_DEBUG` | `true` | Enables detailed error traces. Always `false` in production. |
| `LOG_LEVEL` | `INFO` | Application log level — see **Log Levels** below. |
| `DATABASE_URL` | (auto) | PostgreSQL connection string |
| `ADMIN_PIN` | `1234` | PIN for admin dashboard access |
| `CAMERA_DEVICE_INDEX` | `0` | Camera device index (`/dev/video0` = 0) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins (dev only) |
| `PUBLIC_BASE_URL` | (unset) | Public hostname for digital sharing QR codes (via Cloudflare Tunnel). Unset = share URLs are relative and only work on the kiosk's own browser. |
| `BIND_HOST` | `127.0.0.1` | Network interface for the app port. `0.0.0.0` exposes to LAN (fallback when no tunnel). Default preserves loopback-only binding. |
| `TUNNEL_TOKEN` | (unset) | Cloudflare Tunnel token. Required only when using `make *-tunnel` targets. |

> **Note:** Share landing page branding (brand name, social handle, accent color) is configured at `/admin/sharing` after first boot, not via env vars.

### Log Levels

Control verbosity with the `LOG_LEVEL` environment variable:

| Level | Dev Default | Prod Default | Use When |
|-------|-------------|--------------|----------|
| `DEBUG` | | | Troubleshooting — shows all SQL queries and internal details |
| `INFO` | default | | Normal development — shows app events, no SQL noise |
| `WARNING` | | default | Production — only warnings and errors |
| `ERROR` | | | Minimal output — only failures |
| `CRITICAL` | | | Silent except catastrophic failures |

SQLAlchemy query logging and uvicorn access logs are silenced unless `LOG_LEVEL=DEBUG`.

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
│   │   ├── api/v1/endpoints/# REST API route handlers (6 modules, 66 endpoints)
│   │   ├── core/            # Config, database, security, middleware, exceptions
│   │   ├── models/          # SQLAlchemy ORM models (7 tables)
│   │   ├── payment/         # Payment provider adapters (Midtrans, Xendit, Mock)
│   │   ├── schemas/         # Pydantic request/response schemas (10 modules)
│   │   ├── services/        # Business logic (15 services)
│   │   └── utils/           # Utilities (dithering, ESC/POS, image processing, validators)
│   ├── alembic/             # Database migrations (5 revisions)
│   ├── tests/               # Unit + integration tests (322 tests)
│   └── pyproject.toml       # Python dependencies
├── frontend/                 # React TypeScript SPA
│   ├── src/
│   │   ├── api/             # API client + typed endpoint functions
│   │   ├── components/      # Kiosk screens + admin components + shadcn/ui
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Route page components
│   │   ├── stores/          # Zustand state stores
│   │   └── __tests__/       # Component, hook, and store tests (36 tests)
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
- **Test coverage**: Backend is well-tested (322 tests). Frontend has basic coverage (36 tests) — admin components and most hooks lack tests.
- **Single kiosk**: Currently supports one kiosk instance per deployment. Multi-kiosk architecture is planned (see `docs/technical/multi-kiosk-architecture.md`).
- **Container runs as root**: The Dockerfile has no `USER` directive (audit finding SEC-001). acceptable for a dedicated kiosk host but should be hardened for shared deployments.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
