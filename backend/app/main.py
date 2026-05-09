"""VibePrint OS - FastAPI application entry point."""

import os

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import router as v1_router
from app.core.config import settings
from app.core.events import get_uptime_seconds, lifespan
from app.core.middleware import (
    RateLimitMiddleware,
    RequestIDMiddleware,
    RequestSizeLimitMiddleware,
    register_exception_handlers,
    setup_cors,
)

app = FastAPI(
    title='VibePrint OS',
    description='Open-source AI-powered photobooth kiosk software',
    version='0.1.0',
    lifespan=lifespan,
    debug=settings.app_debug,
)

# Middleware (order matters — outermost added first runs first)
# 1. Rate limiting (outermost — rejects abusive traffic before anything else)
app.add_middleware(
    RateLimitMiddleware,
    max_requests=settings.rate_limit_max_requests,
    window_seconds=settings.rate_limit_window_seconds,
)
# 2. Request size limiting
app.add_middleware(RequestSizeLimitMiddleware)
# 3. Request ID injection
app.add_middleware(RequestIDMiddleware)
setup_cors(app)

# Exception handlers
register_exception_handlers(app)

# API routes (registered before SPA fallback so they match first)
app.include_router(v1_router)


@app.get('/health')
async def health_check() -> dict:
    """Health check endpoint returning uptime and subsystem status."""
    return {
        'status': 'ok',
        'version': '0.1.0',
        'uptime_seconds': get_uptime_seconds(app),
    }


# ---------------------------------------------------------------------------
# Static frontend serving (production only)
# ---------------------------------------------------------------------------
# The Dockerfile multi-stage build copies frontend/dist -> /app/static.
# This code is inert during development because the static/ directory
# doesn't exist in the dev container (dev uses Vite dev server instead).
# The catch-all route is registered LAST so /api/v1/*, /health, /docs
# all match before it.
# ---------------------------------------------------------------------------

STATIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'static')

if os.path.isdir(STATIC_DIR):
    assets_dir = os.path.join(STATIC_DIR, 'assets')
    if os.path.isdir(assets_dir):
        app.mount('/assets', StaticFiles(directory=assets_dir), name='static-assets')

    @app.get('/{full_path:path}')
    async def serve_spa(full_path: str) -> FileResponse:
        """SPA fallback - serve index.html for all non-API, non-file routes."""
        file_path = os.path.join(STATIC_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, 'index.html'))
