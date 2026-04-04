#!/usr/bin/env bash
# =============================================================================
# setup-dev.sh — Bootstrap the VibePrint OS development environment
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "=== VibePrint OS Development Setup ==="
echo ""

# ---- Check prerequisites ----
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "MISSING: $1 is not installed. $2"
        return 1
    fi
    echo "  Found: $1"
    return 0
}

echo "Checking prerequisites..."
ERRORS=0

check_command docker "Install: https://docs.docker.com/get-docker/" || ((ERRORS++))
check_command "docker" "Docker Compose v2 is included with Docker Engine." || true

if docker compose version &> /dev/null; then
    echo "  Found: docker compose (v2)"
else
    echo "MISSING: docker compose (v2). Install Docker Compose plugin."
    ((ERRORS++))
fi

check_command git "Install: sudo apt install git" || ((ERRORS++))
check_command node "Install Node.js 20+: https://nodejs.org/" || ((ERRORS++))
check_command python3 "Install Python 3.12+: https://www.python.org/" || ((ERRORS++))

if [ "${ERRORS}" -ne 0 ]; then
    echo ""
    echo "ERROR: ${ERRORS} prerequisite(s) missing. Please install them and re-run."
    exit 1
fi

echo "All prerequisites met."
echo ""

# ---- Configure environment ----
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "  Created .env — review and adjust settings as needed."
else
    echo "  .env already exists, skipping."
fi

# ---- Start PostgreSQL ----
echo ""
echo "Starting PostgreSQL via Docker Compose..."
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres

echo "Waiting for PostgreSQL to be ready..."
RETRIES=30
until docker compose exec -T postgres pg_isready -U thermavibe &> /dev/null || [ "${RETRIES}" -eq 0 ]; do
    ((RETRIES--))
    sleep 1
done

if [ "${RETRIES}" -eq 0 ]; then
    echo "ERROR: PostgreSQL did not become ready in time."
    exit 1
fi
echo "  PostgreSQL is ready."

# ---- Run database migrations ----
echo ""
echo "Running database migrations..."
if [ -d "backend/alembic/versions" ]; then
    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d app
    sleep 3
    docker compose exec -T app alembic upgrade head 2>/dev/null || echo "  Note: Migrations will run when backend is fully implemented."
else
    echo "  Skipping migrations (not yet available)."
fi

# ---- Install frontend dependencies ----
echo ""
echo "Installing frontend dependencies..."
cd frontend
if [ -f "package.json" ]; then
    npm install
    echo "  Frontend dependencies installed."
else
    echo "  Skipping frontend install (package.json not found)."
fi
cd "${REPO_ROOT}"

# ---- Done ----
echo ""
echo "=== Development environment ready! ==="
echo ""
echo "Next steps:"
echo "  1. Start the backend:    docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d app"
echo "  2. Start the frontend:   cd frontend && npm run dev"
echo "  3. Open in browser:      http://localhost:5173"
echo "  4. API documentation:    http://localhost:8000/docs"
echo ""
echo "Or use the Makefile shortcuts:"
echo "  make dev          # Start everything"
echo "  make dev-down     # Stop everything"
echo "  make test         # Run all tests"
