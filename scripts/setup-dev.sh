#!/usr/bin/env bash
# =============================================================================
# setup-dev.sh — Bootstrap the VibePrint OS development environment
# =============================================================================
# This script performs ONE-TIME setup only:
#   - Checks prerequisites
#   - Creates .env from template
#   - Installs frontend dependencies
#
# After running this, start the app with:  make dev
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
echo "  1. Start the app:         make dev"
echo "  2. Open kiosk UI:         http://localhost:5173"
echo "  3. Open admin dashboard:  http://localhost:5173/admin"
echo "  4. API documentation:     http://localhost:8000/docs"
echo ""
echo "Other commands:"
echo "  make dev-down       # Stop everything"
echo "  make dev-restart    # Clean rebuild (remove images + restart)"
echo "  make test           # Run all tests"
