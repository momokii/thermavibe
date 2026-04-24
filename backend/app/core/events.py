"""FastAPI application lifecycle event handlers.

Provides the lifespan context manager that handles application
startup and shutdown events.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from fastapi import FastAPI

import structlog

from app.core.lifecycle import check_camera_status, check_database_health, check_printer_status
from app.utils.logging import setup_logging

logger = structlog.get_logger(__name__)


@dataclass
class AppState:
    """Shared application state available during the lifespan.

    Attributes:
        start_time: Monotonic time when the application started.
    """

    start_time: float = field(default_factory=time.monotonic)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for startup/shutdown events.

    Startup:
        - Configure structured logging
        - Log application startup with version info
        - Run health checks on database, printer, and camera

    Shutdown:
        - Log application shutdown

    Args:
        app: The FastAPI application instance.
    """
    # --- Startup ---
    setup_logging()
    state = AppState()
    app.state.app_state = state

    logger.info(
        'application_starting',
        version='0.1.0',
    )

    # Seed default config values into database
    try:
        from app.core.database import async_session_maker
        from app.services.config_service import seed_default_configs
        from app.services.theme_service import seed_builtin_themes

        async with async_session_maker() as db:
            config_created = await seed_default_configs(db)
            if config_created > 0:
                logger.info('config_seeded', new_entries=config_created)

            themes_created = await seed_builtin_themes(db)
            if themes_created > 0:
                logger.info('builtin_themes_seeded', new_themes=themes_created)
    except Exception as exc:
        logger.warning('config_seed_failed', error=str(exc))

    # Run health checks (log warnings for unavailable services)
    db_health = await check_database_health()
    printer_health = check_printer_status()
    camera_health = check_camera_status()

    checks = {**db_health, **printer_health, **camera_health}
    for service, status in checks.items():
        if status != 'ok':
            logger.warning('service_unavailable', service=service, status=status)

    logger.info('application_started', health_checks=checks)

    yield  # Application runs here

    # --- Shutdown ---
    logger.info('application_stopping')
    logger.info('application_stopped')


def get_uptime_seconds(app: FastAPI) -> float:
    """Get application uptime in seconds.

    Args:
        app: The FastAPI application instance.

    Returns:
        Number of seconds since application startup.
    """
    state: AppState | None = getattr(app.state, 'app_state', None)
    if state is None:
        return 0.0
    return time.monotonic() - state.start_time
