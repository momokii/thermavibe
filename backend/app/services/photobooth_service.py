"""Photobooth session state machine.

Orchestrates the photobooth flow:
    CAPTURE → FRAME_SELECT → ARRANGE → COMPOSITING → PHOTOBOOTH_REVEAL → RESET

Uses session_service for shared operations (create, transition, finish)
and adds photobooth-specific logic for multi-photo capture, frame selection,
arrangement, and composite generation.
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import SessionNotFoundError, StateTransitionError, VibePrintError
from app.models.analytics import EventType
from app.models.session import KioskSession, KioskState, SessionType
from app.services import session_service
from app.services import theme_service
from app.services import image_composition_service
from app.services import config_service

logger = structlog.get_logger(__name__)


async def create_photobooth_session(
    db: AsyncSession,
    payment_enabled: bool = False,
) -> KioskSession:
    """Create a new photobooth session.

    Args:
        db: Async database session.
        payment_enabled: Whether payment is required.

    Returns:
        New KioskSession with session_type='photobooth'.
    """
    session = await session_service.create_session(
        db,
        payment_enabled=payment_enabled,
        session_type=SessionType.PHOTOBOOTH,
    )
    return session


async def snap_photobooth_photo(
    db: AsyncSession,
    session_id: uuid.UUID,
    photo_path: str,
) -> KioskSession:
    """Snap a photo in photobooth mode. Stays in CAPTURE state.

    Unlike the Vibe Check snap which transitions to REVIEW, photobooth
    allows multiple snaps within the same CAPTURE state.

    Args:
        db: Async database session.
        session_id: Session UUID.
        photo_path: Path to the captured photo.

    Returns:
        Updated KioskSession.
    """
    session = await session_service.get_session(db, session_id)

    if session.state != KioskState.CAPTURE:
        raise StateTransitionError(session.state, KioskState.CAPTURE)

    # Enforce max photo limit from config
    from app.services import config_service

    pb_config = await config_service.get_configs_by_category(db, 'photobooth')
    max_photos = int(pb_config.get('photobooth_max_photos', '8'))
    photos = list(session.photos or [])
    if len(photos) >= max_photos:
        raise VibePrintError(
            f'Maximum of {max_photos} photos reached',
            code='MAX_PHOTOS_REACHED',
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    photos = list(session.photos or [])
    photos.append({'photo_path': photo_path, 'captured_at': now_iso})
    session.photos = photos

    # Record capture event
    event = session_service._make_event(
        session_id=session.id,
        event_type=EventType.CAPTURE_COMPLETE,
        metadata={'photo_path': photo_path, 'photo_index': len(photos) - 1},
    )
    db.add(event)

    await db.commit()
    await db.refresh(session)

    logger.info(
        'photobooth_photo_snapped',
        session_id=str(session.id),
        photo_index=len(photos) - 1,
        total_photos=len(photos),
    )
    return session


async def finish_capture(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> KioskSession:
    """Transition CAPTURE → FRAME_SELECT after capture is done.

    Args:
        db: Async database session.
        session_id: Session UUID.

    Returns:
        Updated KioskSession.
    """
    session = await session_service.get_session(db, session_id)

    if not session.photos or len(session.photos) == 0:
        raise VibePrintError(
            'Cannot finish capture with no photos',
            code='NO_PHOTOS',
        )

    # Enforce min photo limit from config
    from app.services import config_service

    pb_config = await config_service.get_configs_by_category(db, 'photobooth')
    min_photos = int(pb_config.get('photobooth_min_photos', '2'))
    if len(session.photos) < min_photos:
        raise VibePrintError(
            f'Need at least {min_photos} photos, have {len(session.photos)}',
            code='MIN_PHOTOS_NOT_MET',
        )

    # Record event
    event = session_service._make_event(
        session_id=session.id,
        event_type=EventType.PHOTOBOOTH_CAPTURE_START,
        metadata={
            'total_photos': len(session.photos),
            'from_state': KioskState.CAPTURE,
            'to_state': KioskState.FRAME_SELECT,
        },
    )
    db.add(event)

    return await session_service.transition_state(db, session_id, KioskState.FRAME_SELECT)


async def select_frame(
    db: AsyncSession,
    session_id: uuid.UUID,
    theme_id: int,
    layout_rows: int,
) -> KioskSession:
    """Select frame theme and layout. FRAME_SELECT → ARRANGE.

    Args:
        db: Async database session.
        session_id: Session UUID.
        theme_id: Selected theme ID.
        layout_rows: Number of photo rows (1-4).

    Returns:
        Updated KioskSession.
    """
    session = await session_service.get_session(db, session_id)

    if session.state != KioskState.FRAME_SELECT:
        raise StateTransitionError(session.state, KioskState.ARRANGE)

    if layout_rows < 1 or layout_rows > 4:
        raise VibePrintError(
            f'layout_rows must be 1-4, got {layout_rows}',
            code='INVALID_LAYOUT',
        )

    # Verify theme exists
    theme = await theme_service.get_theme(db, theme_id)

    # Store layout configuration
    session.photobooth_layout = {
        'theme_id': theme_id,
        'theme_name': theme.name,
        'layout_rows': layout_rows,
    }

    # Record event
    event = session_service._make_event(
        session_id=session.id,
        event_type=EventType.PHOTOBOOTH_FRAME_SELECT,
        metadata={
            'theme_id': theme_id,
            'theme_name': theme.name,
            'layout_rows': layout_rows,
        },
    )
    db.add(event)

    await db.commit()

    return await session_service.transition_state(db, session_id, KioskState.ARRANGE)


async def arrange_photos(
    db: AsyncSession,
    session_id: uuid.UUID,
    photo_assignments: dict[int, int],
) -> KioskSession:
    """Assign photos to frame slots. ARRANGE → COMPOSITING.

    Args:
        db: Async database session.
        session_id: Session UUID.
        photo_assignments: Map of slot_index → photo_index.

    Returns:
        Updated KioskSession in COMPOSITING state.
    """
    session = await session_service.get_session(db, session_id)

    if session.state != KioskState.ARRANGE:
        raise StateTransitionError(session.state, KioskState.COMPOSITING)

    layout = session.photobooth_layout or {}
    layout_rows = layout.get('layout_rows', 1)
    photos = list(session.photos or [])

    # Validate assignments cover all slots
    for slot_idx in range(layout_rows):
        if slot_idx not in photo_assignments:
            raise VibePrintError(
                f'Slot {slot_idx} has no photo assigned',
                code='INCOMPLETE_ARRANGEMENT',
            )

        photo_idx = photo_assignments[slot_idx]
        if photo_idx < 0 or photo_idx >= len(photos):
            raise VibePrintError(
                f'Photo index {photo_idx} out of range',
                code='INVALID_PHOTO_INDEX',
            )

    # Store assignments in layout
    layout['photo_assignments'] = {
        str(k): v for k, v in photo_assignments.items()
    }
    session.photobooth_layout = layout

    # Record event
    event = session_service._make_event(
        session_id=session.id,
        event_type=EventType.PHOTOBOOTH_ARRANGE,
        metadata={'photo_assignments': photo_assignments},
    )
    db.add(event)

    await db.commit()

    return await session_service.transition_state(db, session_id, KioskState.COMPOSITING)


async def generate_composite(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> KioskSession:
    """Generate the photobooth strip composite. COMPOSITING → PHOTOBOOTH_REVEAL.

    Args:
        db: Async database session.
        session_id: Session UUID.

    Returns:
        Updated KioskSession with composite_image_path set.
    """
    session = await session_service.get_session(db, session_id)

    if session.state != KioskState.COMPOSITING:
        raise StateTransitionError(session.state, KioskState.PHOTOBOOTH_REVEAL)

    layout = session.photobooth_layout or {}
    theme_id = layout.get('theme_id')
    layout_rows = layout.get('layout_rows', 1)
    assignments = layout.get('photo_assignments', {})

    # Get theme config
    theme = await theme_service.get_theme(db, theme_id)
    theme_config = theme.config if isinstance(theme.config, dict) else {}

    # Get ordered photo paths
    photos = list(session.photos or [])
    ordered_paths: list[str] = []
    for slot_idx in range(layout_rows):
        photo_idx = assignments.get(str(slot_idx), slot_idx)
        entry = photos[photo_idx]
        path = entry.get('photo_path') if isinstance(entry, dict) else str(entry)
        ordered_paths.append(path)

    # Get watermark config
    photobooth_config = await config_service.get_configs_by_category(
        db, 'photobooth',
    )
    watermark_text = None
    if photobooth_config.get('photobooth_watermark_enabled', 'false').lower() == 'true':
        watermark_text = photobooth_config.get('photobooth_watermark_text', 'VibePrint OS')

    # Generate composite
    composite_path, thumbnail_path = image_composition_service.compose_photobooth_strip(
        photo_paths=ordered_paths,
        theme_config=theme_config,
        layout_rows=layout_rows,
        session_id=session.id,
        watermark_text=watermark_text,
    )

    session.composite_image_path = composite_path

    # Delete individual photos now that composite is generated (privacy)
    for entry in photos:
        path = entry.get('photo_path') if isinstance(entry, dict) else None
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    session.photos = []

    # Record event
    event = session_service._make_event(
        session_id=session.id,
        event_type=EventType.PHOTOBOOTH_COMPOSITE_GENERATED,
        metadata={
            'composite_path': composite_path,
            'theme_name': theme.name,
            'layout_rows': layout_rows,
        },
    )
    db.add(event)

    session.completed_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(
        'photobooth_composite_generated',
        session_id=str(session.id),
        composite_path=composite_path,
    )

    return await session_service.transition_state(db, session_id, KioskState.PHOTOBOOTH_REVEAL)


async def retake_photobooth(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> KioskSession:
    """Go back to CAPTURE from FRAME_SELECT to retake photos.

    Args:
        db: Async database session.
        session_id: Session UUID.

    Returns:
        Updated KioskSession.
    """
    session = await session_service.get_session(db, session_id)

    if session.state != KioskState.FRAME_SELECT:
        raise StateTransitionError(session.state, KioskState.CAPTURE)

    # Clear layout
    session.photobooth_layout = None

    # Delete existing photos for retake
    if session.photos:
        for entry in session.photos:
            path = entry.get('photo_path') if isinstance(entry, dict) else None
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass
    session.photos = []

    await db.commit()

    return await session_service.transition_state(db, session_id, KioskState.CAPTURE)
