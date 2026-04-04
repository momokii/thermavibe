# VibePrint OS

Open-source, hardware-agnostic kiosk software for AI-powered photobooths.

## What It Does

VibePrint OS turns a basic computer, a USB webcam, and a thermal receipt printer into a self-service "AI Vibe/Aura Booth." Users walk up, pay a micro-transaction (QRIS), get their photo taken, receive a witty AI-generated reading, and walk away with a physical thermal-printed receipt. Operators download the software, plug in hardware, and earn passive income.

## Architecture

- **Backend:** Python / FastAPI — handles camera capture, AI dispatch, payment processing, thermal printing, and session state management
- **Frontend:** React / TypeScript / Vite — kiosk UI running in Chromium `--kiosk` mode, plus a PIN-protected operator dashboard
- **Database:** PostgreSQL — session logs, configuration, analytics
- **AI:** Provider-agnostic — supports OpenAI, Anthropic, Google Vision, and local models via Ollama
- **Deployment:** Docker Compose on Linux (Ubuntu/Debian)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Linux host (Ubuntu/Debian recommended)
- USB webcam (UVC-compliant)
- ESC/POS-compatible thermal printer (USB)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/thermavibe.git
cd thermavibe

# 2. Configure environment
cp .env.example .env
# Edit .env with your API keys and hardware settings

# 3. Start the application
docker compose up --build -d

# 4. Launch kiosk mode (on the kiosk machine)
bash scripts/start-kiosk.sh
```

The application is available at `http://localhost:8000`. API documentation at `http://localhost:8000/docs`.

## Documentation

Full documentation is in the [`docs/`](docs/README.md) directory:

### Product
- [Executive Summary](docs/prd/00-executive-summary.md)
- [Personas & Goals](docs/prd/01-personas-and-goals.md)
- [Functional Requirements](docs/prd/02-functional-requirements.md)
- [Non-Functional Requirements](docs/prd/03-nonfunctional-requirements.md)
- [User Flows](docs/prd/04-user-flows.md)
- [Data Models](docs/prd/05-data-models.md)
- [Integration Map](docs/prd/06-integration-map.md)

### Technical
- [Architecture Overview](docs/technical/architecture-overview.md)
- [Tech Stack Decisions](docs/technical/tech-stack-decision-record.md)
- [Development Setup Guide](docs/technical/development-setup-guide.md)
- [API Contract](docs/technical/api-contract.md)
- [Docker Deployment Guide](docs/technical/docker-deployment-guide.md)
- [Coding Standards](docs/technical/coding-standards.md)
- [Testing Strategy](docs/technical/testing-strategy.md)

## Development

See the [Development Setup Guide](docs/technical/development-setup-guide.md) for detailed instructions.

```bash
# Start development environment
make dev

# Run tests
make test

# Lint code
make lint
```

## License

MIT License. See [LICENSE](LICENSE) for details.

## Project Status

Phase 0 — Project scaffolding and documentation complete. Core implementation begins in Phase 1.
