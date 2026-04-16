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
from app.schemas.common import SuccessMessage
from app.schemas.kiosk import (
    CaptureResponse,
    SelectRequest,
    SessionCreateRequest,
    SessionFinishResponse,
    SessionResponse,
    SnapResponse,
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
    """Create a new kiosk session."""
    session = await session_service.create_session(
        db=db,
        payment_enabled=body.payment_enabled or settings.payment_enabled,
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
    try:
        ai_result = await analyze_image(
            image_bytes=photo_bytes,
            session_id=session_id,
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
    try:
        ai_result = await analyze_image(
            image_bytes=photo_bytes,
            session_id=session_id,
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
        capture_time_limit=settings.kiosk_capture_time_limit_seconds,
    )
