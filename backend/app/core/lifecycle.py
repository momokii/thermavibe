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

    Queries the printer service for real connection status.

    Returns:
        Dict with 'printer' key set to 'ok' or 'unavailable'.
    """
    try:
        from app.services.printer_service import get_printer_status

        status = get_printer_status()
        return {'printer': 'ok' if status.connected else 'unavailable'}
    except Exception:
        return {'printer': 'unavailable'}


def check_camera_status() -> dict[str, str]:
    """Check camera device status.

    Probes for available cameras and logs what was detected.

    Returns:
        Dict with 'camera' key set to 'ok' or 'unavailable'.
    """
    try:
        from app.services.camera_service import get_active_camera, list_devices

        devices = list_devices()
        if devices.devices:
            for d in devices.devices:
                logger.info('camera_detected', index=d.index, name=d.name, path=d.path)
        else:
            logger.warning('no_cameras_detected')

        active = get_active_camera()
        return {'camera': 'ok' if active else 'unavailable'}
    except Exception:
        return {'camera': 'unavailable'}
