"""VibePrint OS - FastAPI application entry point."""

from fastapi import FastAPI

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

# Routes
app.include_router(v1_router)


@app.get('/health')
async def health_check() -> dict:
    """Health check endpoint returning uptime and subsystem status."""
    return {
        'status': 'ok',
        'version': '0.1.0',
        'uptime_seconds': get_uptime_seconds(app),
    }
