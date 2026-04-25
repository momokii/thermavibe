"""Kiosk session state machine API endpoints."""

from __future__ import annotations

import os
import time
from uuid import UUID

import structlog
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_settings
from app.core.config import Settings
from app.core.exceptions import SessionNotFoundError
from app.models.session import SessionType
from app.schemas.common import SuccessMessage
from app.schemas.kiosk import (
    CaptureResponse,
    SelectRequest,
    SessionCreateRequest,
    SessionFinishResponse,
    SessionResponse,
    SnapResponse,
)
from app.schemas.photobooth import (
    ArrangeRequest,
    FeaturesResponse,
    FrameSelectRequest,
    PhotoboothSnapResponse,
    ShareResponse,
)
from app.schemas.print import PrintJobRequest
from app.services import session_service

router = APIRouter()

log = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

@router.post('/session', response_model=SessionResponse, status_code=201)
async def create_session(
    body: SessionCreateRequest,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Create a new kiosk session.

    Accepts optional session_type ('vibe_check' or 'photobooth').
    Default is 'vibe_check' for backward compatibility.
    """
    session = await session_service.create_session(
        db=db,
        payment_enabled=body.payment_enabled or settings.payment_enabled,
        session_type=body.session_type,
    )
    return _session_to_response(session, settings)


@router.get('/session/{session_id}', response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Get the current state of a kiosk session."""
    session = await session_service.get_session(db, session_id)
    return _session_to_response(session, settings)


# ---------------------------------------------------------------------------
# Multi-photo capture flow
# ---------------------------------------------------------------------------

@router.post('/session/{session_id}/snap', response_model=SnapResponse)
async def snap_photo(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SnapResponse:
    """Snap a photo without AI analysis.

    Saves the photo, appends it to the session's gallery, and transitions
    to REVIEW state.  The frontend can call this repeatedly while the
    capture timer has not expired.
    """
    from app.services.camera_service import capture_frame as camera_capture

    # Transition to CAPTURE if still in IDLE
    session = await session_service.get_session(db, session_id)
    if session.state == 'idle':
        session = await session_service.start_session(
            db=db,
            session_id=session_id,
            payment_enabled=False,
        )

    # Capture photo
    photo_bytes = await camera_capture()

    # Save to disk with index
    existing = list(session.photos or [])
    photo_index = len(existing)
    photo_path = f'/tmp/vibeprint_snap_{session_id}_{photo_index}.jpg'
    with open(photo_path, 'wb') as f:
        f.write(photo_bytes)

    # Append to gallery and transition to REVIEW
    session = await session_service.snap_photo(
        db=db,
        session_id=session_id,
        photo_path=photo_path,
    )

    # Calculate time remaining
    first_snap_at = existing[0].get('captured_at') if existing else session.created_at.isoformat()
    try:
        from datetime import datetime, timezone
        started = datetime.fromisoformat(first_snap_at)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    except (ValueError, TypeError):
        elapsed = 0.0
    time_remaining = max(0.0, settings.kiosk_capture_time_limit_seconds - elapsed)

    photos_list = _build_photo_urls(session_id, session.photos or [])

    return SnapResponse(
        id=session.id,
        state=session.state,
        photos=photos_list,
        photo_url=f'/api/v1/kiosk/session/{session_id}/photo/{photo_index}',
        photo_index=photo_index,
        time_remaining_seconds=time_remaining,
    )


@router.post('/session/{session_id}/select', response_model=CaptureResponse)
async def select_photo(
    session_id: UUID,
    body: SelectRequest,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> CaptureResponse:
    """Select a photo from the gallery for AI analysis.

    Deletes all unselected photos immediately (privacy-first), runs AI
    analysis on the selected photo, and transitions through PROCESSING to
    REVEAL.
    """
    from app.services.ai_service import analyze_image
    from app.services import config_service

    # Select photo and transition REVIEW → PROCESSING
    session = await session_service.select_and_process(
        db=db,
        session_id=session_id,
        photo_index=body.photo_index,
    )

    # Read the selected photo bytes for AI analysis
    photo_path = session.photo_path
    if not photo_path or not os.path.exists(photo_path):
        log.error('selected_photo_missing', session_id=str(session_id), path=photo_path)
        raise SessionNotFoundError(str(session_id))

    with open(photo_path, 'rb') as f:
        photo_bytes = f.read()

    # Run AI analysis
    ai_config = await config_service.get_ai_config(db)
    try:
        ai_result = await analyze_image(
            image_bytes=photo_bytes,
            session_id=session_id,
            ai_config=ai_config,
        )
        log.info(
            'ai_analysis_complete',
            session_id=str(session_id),
            provider=ai_result.provider,
            latency_ms=ai_result.latency_ms,
        )
    except Exception as exc:
        log.error('ai_analysis_failed', session_id=str(session_id), error=str(exc))
        raise

    # Store AI response and transition to REVEAL
    session = await session_service.store_ai_response(
        db=db,
        session_id=session_id,
        response_text=ai_result.analysis_text,
        provider=ai_result.provider,
    )

    return CaptureResponse(
        id=session.id,
        state=session.state,
        payment_enabled=session.payment_status is not None,
        payment_status=session.payment_status,
        captured_at=session.completed_at,
        capture_image_url=f'/api/v1/kiosk/session/{session_id}/photo',
        analysis_text=session.ai_response_text,
        analysis_provider=session.ai_provider_used,
        printed_at=None,
        created_at=session.created_at,
        updated_at=None,
        expires_at=None,
    )


@router.post('/session/{session_id}/retake', response_model=SessionResponse)
async def retake_photo(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Go back to CAPTURE state to take another photo."""
    session = await session_service.retake_photo(db=db, session_id=session_id)
    return _session_to_response(session, settings)


# ---------------------------------------------------------------------------
# Photo serving
# ---------------------------------------------------------------------------

@router.get('/session/{session_id}/photo')
async def get_session_photo(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
):
    """Serve the selected/captured photo JPEG for a session."""
    session = await session_service.get_session(db, session_id)

    if not session.photo_path:
        raise SessionNotFoundError(str(session_id))

    if not os.path.exists(session.photo_path):
        raise SessionNotFoundError(str(session_id))

    return FileResponse(
        session.photo_path,
        media_type='image/jpeg',
        filename=f'vibeprint_{session_id}.jpg',
    )


@router.get('/session/{session_id}/photo/{photo_index}')
async def get_session_gallery_photo(
    session_id: UUID,
    photo_index: int,
    db: AsyncSession = Depends(get_db_session),
):
    """Serve a specific photo from the session gallery by index."""
    session = await session_service.get_session(db, session_id)

    photos = session.photos or []
    if photo_index < 0 or photo_index >= len(photos):
        raise SessionNotFoundError(str(session_id))

    entry = photos[photo_index]
    path = entry.get('photo_path') if isinstance(entry, dict) else None
    if not path or not os.path.exists(path):
        raise SessionNotFoundError(str(session_id))

    return FileResponse(
        path,
        media_type='image/jpeg',
        filename=f'vibeprint_{session_id}_{photo_index}.jpg',
    )


# ---------------------------------------------------------------------------
# Legacy single-shot capture (backward compat)
# ---------------------------------------------------------------------------

@router.post('/session/{session_id}/capture', response_model=CaptureResponse, deprecated=True)
async def capture_photo(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> CaptureResponse:
    """Single-shot capture: snap + select + AI in one call (legacy).

    Prefer the /snap → /select flow for multi-photo support.
    """
    from app.services.ai_service import analyze_image
    from app.services import config_service
    from app.services.camera_service import capture_frame as camera_capture

    # Transition to CAPTURE if still in IDLE
    session = await session_service.get_session(db, session_id)
    if session.state == 'idle':
        session = await session_service.start_session(
            db=db,
            session_id=session_id,
            payment_enabled=False,
        )

    # Capture photo
    photo_bytes = await camera_capture()

    # Save
    photo_path = f'/tmp/vibeprint_capture_{session_id}.jpg'
    with open(photo_path, 'wb') as f:
        f.write(photo_bytes)

    # Transition CAPTURE → PROCESSING
    session = await session_service.capture_photo(
        db=db,
        session_id=session_id,
        photo_path=photo_path,
    )

    # AI analysis
    ai_config = await config_service.get_ai_config(db)
    try:
        ai_result = await analyze_image(
            image_bytes=photo_bytes,
            session_id=session_id,
            ai_config=ai_config,
        )
        log.info(
            'ai_analysis_complete',
            session_id=str(session_id),
            provider=ai_result.provider,
            latency_ms=ai_result.latency_ms,
        )
    except Exception as exc:
        log.error('ai_analysis_failed', session_id=str(session_id), error=str(exc))
        raise

    # Store and transition to REVEAL
    session = await session_service.store_ai_response(
        db=db,
        session_id=session_id,
        response_text=ai_result.analysis_text,
        provider=ai_result.provider,
    )

    return CaptureResponse(
        id=session.id,
        state=session.state,
        payment_enabled=session.payment_status is not None,
        payment_status=session.payment_status,
        captured_at=session.completed_at,
        capture_image_url=f'/api/v1/kiosk/session/{session_id}/photo',
        analysis_text=session.ai_response_text,
        analysis_provider=session.ai_provider_used,
        printed_at=None,
        created_at=session.created_at,
        updated_at=None,
        expires_at=None,
    )


# ---------------------------------------------------------------------------
# Print + Finish
# ---------------------------------------------------------------------------

@router.post('/session/{session_id}/print', response_model=SuccessMessage)
async def print_receipt(
    session_id: UUID,
    body: PrintJobRequest | None = None,
    db: AsyncSession = Depends(get_db_session),
) -> SuccessMessage:
    """Trigger a print for the session's vibe reading."""
    if body is None:
        body = PrintJobRequest()

    session = await session_service.get_session(db, session_id)

    if not session.ai_response_text:
        return SuccessMessage(message='No AI response to print')

    try:
        from app.services.printer_service import print_receipt as do_print

        result = do_print(
            ai_text=session.ai_response_text,
            photo_bytes=None,
            include_photo=body.include_photo,
        )
        return SuccessMessage(message=result.get('message', 'Print sent'))
    except Exception as exc:
        return SuccessMessage(message=f'Print failed: {exc}')


@router.post('/session/{session_id}/finish', response_model=SessionFinishResponse)
async def finish_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> SessionFinishResponse:
    """End a session and clear all data for privacy."""
    result = await session_service.finish_session(db, session_id)
    return SessionFinishResponse(**result)


# ---------------------------------------------------------------------------
# Photobooth flow
# ---------------------------------------------------------------------------

@router.post('/session/{session_id}/photobooth/snap', response_model=PhotoboothSnapResponse)
async def photobooth_snap(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> PhotoboothSnapResponse:
    """Snap a photo in photobooth mode. Stays in CAPTURE state."""
    from app.services.camera_service import capture_frame as camera_capture
    from app.services import photobooth_service

    session = await session_service.get_session(db, session_id)

    # Transition to CAPTURE if still in IDLE
    if session.state == 'idle':
        session = await session_service.start_session(
            db=db,
            session_id=session_id,
            payment_enabled=False,
        )

    # Capture photo
    photo_bytes = await camera_capture()

    # Save to disk
    existing = list(session.photos or [])
    photo_index = len(existing)
    photo_path = f'/tmp/vibeprint_pb_snap_{session_id}_{photo_index}.jpg'
    with open(photo_path, 'wb') as f:
        f.write(photo_bytes)

    # Save photo (stays in CAPTURE state)
    session = await photobooth_service.snap_photobooth_photo(
        db=db,
        session_id=session_id,
        photo_path=photo_path,
    )

    # Calculate time remaining — read from DB config (admin settings) with .env fallback
    from app.services import config_service

    pb_config = await config_service.get_configs_by_category(db, 'photobooth')
    time_limit = int(pb_config.get('photobooth_capture_time_limit_seconds', settings.photobooth_capture_time_limit_seconds))
    first_snap_at = existing[0].get('captured_at') if existing else session.created_at.isoformat()
    try:
        from datetime import datetime, timezone
        started = datetime.fromisoformat(first_snap_at)
        elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    except (ValueError, TypeError):
        elapsed = 0.0
    time_remaining = max(0.0, time_limit - elapsed)

    return PhotoboothSnapResponse(
        id=session.id,
        state=session.state,
        photo_url=f'/api/v1/kiosk/session/{session_id}/photo/{photo_index}',
        photo_index=photo_index,
        total_photos=len(session.photos or []),
        time_remaining_seconds=time_remaining,
    )


@router.post('/session/{session_id}/photobooth/done', response_model=SessionResponse)
async def photobooth_done_capture(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Finish capture phase and move to frame selection."""
    from app.services import photobooth_service

    session = await photobooth_service.finish_capture(db=db, session_id=session_id)
    return _session_to_response(session, settings)


@router.post('/session/{session_id}/photobooth/frame', response_model=SessionResponse)
async def photobooth_select_frame(
    session_id: UUID,
    body: FrameSelectRequest,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Select frame theme and layout, then move to arrange."""
    from app.services import photobooth_service

    session = await photobooth_service.select_frame(
        db=db,
        session_id=session_id,
        theme_id=body.theme_id,
        layout_rows=body.layout_rows,
    )
    return _session_to_response(session, settings)


@router.post('/session/{session_id}/photobooth/arrange', response_model=SessionResponse)
async def photobooth_arrange(
    session_id: UUID,
    body: ArrangeRequest,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Assign photos to slots and trigger composite generation."""
    from app.services import photobooth_service

    # Assign photos
    session = await photobooth_service.arrange_photos(
        db=db,
        session_id=session_id,
        photo_assignments=body.photo_assignments,
    )

    # Generate composite (transitions to PHOTOBOOTH_REVEAL)
    session = await photobooth_service.generate_composite(
        db=db,
        session_id=session_id,
    )

    return _session_to_response(session, settings)


@router.get('/session/{session_id}/photobooth/composite')
async def get_photobooth_composite(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
):
    """Serve the generated photobooth composite image."""
    session = await session_service.get_session(db, session_id)

    if not session.composite_image_path:
        raise SessionNotFoundError(str(session_id))

    if not os.path.exists(session.composite_image_path):
        raise SessionNotFoundError(str(session_id))

    return FileResponse(
        session.composite_image_path,
        media_type='image/jpeg',
        filename=f'vibeprint_strip_{session_id}.jpg',
    )


@router.post('/session/{session_id}/photobooth/print', response_model=SuccessMessage)
async def photobooth_print(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> SuccessMessage:
    """Print the photobooth strip on the thermal printer."""
    session = await session_service.get_session(db, session_id)

    if not session.composite_image_path or not os.path.exists(session.composite_image_path):
        return SuccessMessage(message='No composite image to print')

    try:
        from app.services.printer_service import print_photobooth_strip
        result = print_photobooth_strip(session.composite_image_path)
        return SuccessMessage(message=result.get('message', 'Print sent'))
    except Exception as exc:
        return SuccessMessage(message=f'Print failed: {exc}')


@router.post('/session/{session_id}/photobooth/retake', response_model=SessionResponse)
async def photobooth_retake(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    """Go back to CAPTURE from FRAME_SELECT to retake photos."""
    from app.services import photobooth_service

    session = await photobooth_service.retake_photobooth(db=db, session_id=session_id)
    return _session_to_response(session, settings)


@router.get('/session/{session_id}/photobooth/share', response_model=ShareResponse)
async def photobooth_share(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> ShareResponse:
    """Generate a temporary share URL for the composite image."""
    from app.services.share_service import generate_share_token

    session = await session_service.get_session(db, session_id)

    if not session.composite_image_path:
        raise SessionNotFoundError(str(session_id))

    ttl = settings.photobooth_share_url_ttl_seconds
    token, expires_at = generate_share_token(str(session_id), ttl_seconds=ttl)

    share_url = f'/api/v1/kiosk/share/{token}'

    return ShareResponse(
        share_url=share_url,
        expires_in=ttl,
        qr_data=share_url,
    )


# ---------------------------------------------------------------------------
# Public share endpoint (no auth needed)
# ---------------------------------------------------------------------------

@router.get('/share/{token}')
async def serve_shared_composite(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    """Serve a composite image via a temporary share token."""
    from app.services.share_service import validate_share_token

    session_id = validate_share_token(token)

    session = await session_service.get_session(db, UUID(session_id))

    if not session.composite_image_path or not os.path.exists(session.composite_image_path):
        raise SessionNotFoundError(session_id)

    return FileResponse(
        session.composite_image_path,
        media_type='image/jpeg',
        filename=f'vibeprint_strip_{session_id}.jpg',
    )


# ---------------------------------------------------------------------------
# Feature flags (public, no auth)
# ---------------------------------------------------------------------------

@router.get('/features', response_model=FeaturesResponse)
async def get_features(
    db: AsyncSession = Depends(get_db_session),
) -> FeaturesResponse:
    """Get enabled features for kiosk initialization."""
    from app.services import config_service

    photobooth_config = await config_service.get_configs_by_category(db, 'photobooth')
    photobooth_enabled = photobooth_config.get('photobooth_enabled', 'true').lower() == 'true'
    max_photos = int(photobooth_config.get('photobooth_max_photos', '8'))
    min_photos = int(photobooth_config.get('photobooth_min_photos', '2'))

    # Vibe check is always enabled (at least one feature must be on)
    return FeaturesResponse(
        vibe_check_enabled=True,
        photobooth_enabled=photobooth_enabled,
        photobooth_max_photos=max_photos,
        photobooth_min_photos=min_photos,
    )


# ---------------------------------------------------------------------------
# Public photobooth theme listing (no auth needed)
# ---------------------------------------------------------------------------

@router.get('/photobooth/themes')
async def list_public_themes(
    db: AsyncSession = Depends(get_db_session),
):
    """List enabled photobooth themes for the kiosk (public, no auth)."""
    from app.services import theme_service
    from app.schemas.photobooth import ThemeResponse

    themes = await theme_service.list_themes(db, enabled_only=True)
    return [
        ThemeResponse(
            id=t.id,
            name=t.name,
            display_name=t.display_name,
            config=t.config,
            preview_image_url=None,
            is_builtin=t.is_builtin,
            is_enabled=t.is_enabled,
            is_default=t.is_default,
            sort_order=t.sort_order,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in themes
    ]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_photo_urls(session_id: UUID, photos: list) -> list:
    """Convert photo entries to PhotoEntry schemas with URLs."""
    from app.schemas.kiosk import PhotoEntry

    result = []
    for i, entry in enumerate(photos):
        captured_at = entry.get('captured_at', '') if isinstance(entry, dict) else ''
        result.append(PhotoEntry(
            photo_url=f'/api/v1/kiosk/session/{session_id}/photo/{i}',
            captured_at=captured_at,
        ))
    return result


def _session_to_response(session, settings: Settings) -> SessionResponse:
    """Convert a KioskSession ORM model to a SessionResponse schema."""
    photos_list = _build_photo_urls(session.id, session.photos or [])

    # Use session-type-appropriate time limit
    if getattr(session, 'session_type', None) == SessionType.PHOTOBOOTH:
        time_limit = settings.photobooth_capture_time_limit_seconds
    else:
        time_limit = settings.kiosk_capture_time_limit_seconds

    return SessionResponse(
        id=session.id,
        state=session.state,
        payment_enabled=settings.payment_enabled,
        payment_status=session.payment_status,
        captured_at=session.completed_at,
        capture_image_url=None,
        analysis_text=session.ai_response_text,
        analysis_provider=session.ai_provider_used,
        printed_at=None,
        created_at=session.created_at,
        updated_at=None,
        expires_at=None,
        photos=photos_list,
        capture_time_limit=time_limit,
    )
