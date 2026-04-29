"""Retention policy enforcement service.

Purges expired photobooth composites and vibe check photos based on
retention hours configured in the operator_configs table.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.configuration import ConfigCategory
from app.models.session import KioskSession, SessionType
from app.services.config_service import get_configs_by_category

logger = structlog.get_logger(__name__)

# Fallback interval if both retention periods are 0 (forever)
FALLBACK_INTERVAL_HOURS = 6


def _safe_remove(path: str) -> bool:
    """Remove a file, silently ignoring missing files."""
    try:
        if os.path.exists(path):
            os.remove(path)
            return True
    except OSError:
        pass
    return False


def _find_thumbnail(image_path: str) -> str | None:
    """Derive the thumbnail path from an image path.

    Photobooth composites: vibeprint_composite_ → vibeprint_thumb_
    Vibe check photos: vibeprint_ → vibeprint_thumb_
    """
    basename = os.path.basename(image_path)
    directory = os.path.dirname(image_path)

    if 'vibeprint_composite_' in basename:
        thumb_name = basename.replace('vibeprint_composite_', 'vibeprint_thumb_')
    elif basename.startswith('vibeprint_'):
        thumb_name = basename.replace('vibeprint_', 'vibeprint_thumb_', 1)
    else:
        return None

    return os.path.join(directory, thumb_name)


async def purge_expired_sessions(db: AsyncSession) -> dict[str, int]:
    """Delete expired images and clear database references.

    Reads retention hours from DB config for both photobooth and vibe_check
    categories. Sessions older than the retention period have their image
    files deleted from disk and path fields nulled in the database.

    Args:
        db: Async database session.

    Returns:
        Dict with purge counts: {"photobooth_purged": N, "vibe_check_purged": N}
    """
    pb_config = await get_configs_by_category(db, ConfigCategory.PHOTOBOOTH)
    vc_config = await get_configs_by_category(db, ConfigCategory.VIBE_CHECK)

    pb_retention_hours = int(pb_config.get('photobooth_composite_retention_hours', '168'))
    vc_retention_hours = int(vc_config.get('vibe_check_retention_hours', '168'))

    counts: dict[str, int] = {'photobooth_purged': 0, 'vibe_check_purged': 0}

    now = datetime.now(timezone.utc)

    # --- Photobooth composites ---
    if pb_retention_hours > 0:
        cutoff = now - timedelta(hours=pb_retention_hours)
        stmt = (
            select(KioskSession)
            .where(
                KioskSession.session_type == SessionType.PHOTOBOOTH,
                KioskSession.composite_image_path.isnot(None),  # type: ignore[union-attr]
                KioskSession.created_at < cutoff,
            )
        )
        result = await db.execute(stmt)
        sessions = result.scalars().all()

        for session in sessions:
            _safe_remove(session.composite_image_path)
            thumb = _find_thumbnail(session.composite_image_path)
            if thumb:
                _safe_remove(thumb)
            session.composite_image_path = None
            counts['photobooth_purged'] += 1

    # --- Vibe check photos ---
    if vc_retention_hours > 0:
        cutoff = now - timedelta(hours=vc_retention_hours)
        stmt = (
            select(KioskSession)
            .where(
                KioskSession.session_type == SessionType.VIBE_CHECK,
                KioskSession.photo_path.isnot(None),  # type: ignore[union-attr]
                KioskSession.created_at < cutoff,
            )
        )
        result = await db.execute(stmt)
        sessions = result.scalars().all()

        for session in sessions:
            _safe_remove(session.photo_path)
            thumb = _find_thumbnail(session.photo_path)
            if thumb:
                _safe_remove(thumb)
            session.photo_path = None
            session.ai_response_text = None
            session.ai_provider_used = None
            counts['vibe_check_purged'] += 1

    if counts['photobooth_purged'] or counts['vibe_check_purged']:
        await db.commit()
        logger.info('retention_purged', **counts)

    return counts


async def get_auto_cleanup_interval_hours(db: AsyncSession) -> int:
    """Derive cleanup interval from the shorter retention period.

    Reads both photobooth and vibe_check retention hours and returns
    the shorter one as the cleanup interval. If both are 0 (forever),
    falls back to 6 hours so the loop still runs and can react to
    future config changes.

    Args:
        db: Async database session.

    Returns:
        Cleanup interval in hours.
    """
    pb_config = await get_configs_by_category(db, ConfigCategory.PHOTOBOOTH)
    vc_config = await get_configs_by_category(db, ConfigCategory.VIBE_CHECK)

    pb_hours = int(pb_config.get('photobooth_composite_retention_hours', '168'))
    vc_hours = int(vc_config.get('vibe_check_retention_hours', '168'))

    # Filter out 0 (forever) — those don't need periodic checks
    active_periods = [h for h in (pb_hours, vc_hours) if h > 0]

    if not active_periods:
        return FALLBACK_INTERVAL_HOURS

    return min(active_periods)


async def retention_cleanup_loop(session_factory) -> None:
    """Background task that periodically purges expired images.

    Reads the cleanup interval from DB config each cycle so operators
    can tune it from the admin panel without restarting.

    Args:
        session_factory: Async context manager that yields an AsyncSession.
    """
    while True:
        try:
            async with session_factory() as db:
                interval = await get_auto_cleanup_interval_hours(db)
        except Exception:
            interval = FALLBACK_INTERVAL_HOURS

        await asyncio.sleep(interval * 3600)

        try:
            async with session_factory() as db:
                result = await purge_expired_sessions(db)
                if result['photobooth_purged'] or result['vibe_check_purged']:
                    logger.info('retention_cleanup', **result)
                else:
                    logger.debug('retention_cleanup', status='no_expired_sessions')
        except Exception as exc:
            logger.warning('retention_cleanup_failed', error=str(exc))
