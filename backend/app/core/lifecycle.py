"""Application startup/shutdown lifecycle helpers.

Business-level initialization and cleanup logic called by the
FastAPI lifespan context manager in events.py.
"""

from __future__ import annotations

import structlog

logger = structlog.get_logger(__name__)


async def check_database_health() -> dict[str, str]:
    """Check database connectivity by executing a simple query.

    Returns:
        Dict with 'database' key set to 'ok' or 'unavailable'.
    """
    try:
        from sqlalchemy import text

        from app.core.database import engine

        async with engine.connect() as conn:
            await conn.execute(text('SELECT 1'))
        return {'database': 'ok'}
    except Exception:
        logger.exception('database_health_check_failed')
        return {'database': 'unavailable'}


def check_printer_status() -> dict[str, str]:
    """Check thermal printer connectivity status.

    Returns:
        Dict with 'printer' key set to 'ok' or 'unavailable'.
        Real hardware detection implemented in Wave 3.
    """
    # Placeholder — real ESC/POS USB detection comes in Wave 3
    return {'printer': 'ok'}


def check_camera_status() -> dict[str, str]:
    """Check camera device status.

    Returns:
        Dict with 'camera' key set to 'ok' or 'unavailable'.
        Real hardware detection implemented in Wave 3.
    """
    # Placeholder — real OpenCV/V4L2 detection comes in Wave 3
    return {'camera': 'ok'}
