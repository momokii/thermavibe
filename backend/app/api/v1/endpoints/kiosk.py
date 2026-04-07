"""Kiosk session state machine API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_settings
from app.core.config import Settings
from app.schemas.common import SuccessMessage
from app.schemas.kiosk import CaptureResponse, SessionCreateRequest, SessionFinishResponse, SessionResponse
from app.schemas.print import PrintJobRequest
from app.services import session_service

router = APIRouter()


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


@router.post('/session/{session_id}/capture', response_model=CaptureResponse)
async def capture_photo(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> CaptureResponse:
    """Trigger a photo capture for the session."""
    from app.services.camera_service import capture_frame as camera_capture

    photo_bytes = await camera_capture()

    session = await session_service.capture_photo(
        db=db,
        session_id=session_id,
        photo_path=f'/tmp/vibepint_capture_{session_id}.jpg',
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


def _session_to_response(session, settings: Settings) -> SessionResponse:
    """Convert a KioskSession ORM model to a SessionResponse schema."""
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
    )
