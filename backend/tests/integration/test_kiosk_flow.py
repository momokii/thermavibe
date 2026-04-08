"""Integration tests for full kiosk flow -- session creation through print and reset.

Tests exercise the FastAPI endpoints via httpx AsyncClient with ASGITransport.
The database dependency is overridden with an in-memory SQLite session.
Hardware services (camera, printer) and the session service are mocked at
the endpoint module level so no real hardware or AI provider is required.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.session import KioskSession, KioskState, PaymentStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_session(
    session_id: uuid.UUID | None = None,
    state: str = KioskState.IDLE,
    payment_status: str | None = None,
    ai_response_text: str | None = None,
    ai_provider_used: str | None = None,
    photo_path: str | None = None,
    created_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> MagicMock:
    """Create a MagicMock that quacks like a KioskSession ORM object."""
    now = created_at or datetime.now(timezone.utc)
    mock = MagicMock(spec=KioskSession)
    mock.id = session_id or uuid.uuid4()
    mock.state = state
    mock.payment_status = payment_status
    mock.ai_response_text = ai_response_text
    mock.ai_provider_used = ai_provider_used
    mock.photo_path = photo_path
    mock.payment_provider = None
    mock.payment_amount = None
    mock.payment_reference = None
    mock.cleared_at = None
    mock.created_at = now
    mock.completed_at = completed_at
    return mock


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_returns_201(client: AsyncClient):
    """POST /api/v1/kiosk/session returns 201 with state='idle'."""
    mock_session = _make_mock_session()

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.create_session = AsyncMock(return_value=mock_session)

        resp = await client.post('/api/v1/kiosk/session', json={'payment_enabled': False})

    assert resp.status_code == 201
    data = resp.json()
    assert data['state'] == 'idle'
    assert 'id' in data
    svc.create_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_session_defaults_payment_enabled(client: AsyncClient):
    """POST /api/v1/kiosk/session with no body defaults payment_enabled=False."""
    mock_session = _make_mock_session()

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.create_session = AsyncMock(return_value=mock_session)

        resp = await client.post('/api/v1/kiosk/session', json={})

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_get_session_returns_200(client: AsyncClient, sample_session_id: uuid.UUID):
    """GET /api/v1/kiosk/session/{id} returns 200 with session data."""
    mock_session = _make_mock_session(session_id=sample_session_id)

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.get_session = AsyncMock(return_value=mock_session)

        resp = await client.get(f'/api/v1/kiosk/session/{sample_session_id}')

    assert resp.status_code == 200
    data = resp.json()
    assert data['id'] == str(sample_session_id)
    assert data['state'] == 'idle'
    svc.get_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_session_not_found_returns_404(client: AsyncClient):
    """GET /api/v1/kiosk/session/{bad_id} returns 404 with error envelope."""
    from app.core.exceptions import SessionNotFoundError

    bad_id = uuid.uuid4()

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.get_session = AsyncMock(side_effect=SessionNotFoundError(str(bad_id)))

        resp = await client.get(f'/api/v1/kiosk/session/{bad_id}')

    assert resp.status_code == 404
    data = resp.json()
    assert 'error' in data
    assert data['error']['code'] == 'SESSION_NOT_FOUND'


@pytest.mark.asyncio
async def test_capture_photo_returns_capture_response(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/kiosk/session/{id}/capture returns CaptureResponse."""
    mock_session = _make_mock_session(
        session_id=sample_session_id,
        state=KioskState.PROCESSING,
        payment_status=None,
    )
    fake_jpeg = b'\xff\xd8\xff\xe0' + b'\x00' * 100 + b'\xff\xd9'

    with (
        patch('app.api.v1.endpoints.kiosk.session_service') as svc,
        patch('app.services.camera_service.capture_frame', new_callable=AsyncMock, return_value=fake_jpeg),
    ):
        svc.capture_photo = AsyncMock(return_value=mock_session)

        resp = await client.post(f'/api/v1/kiosk/session/{sample_session_id}/capture')

    assert resp.status_code == 200
    data = resp.json()
    assert data['state'] == 'processing'
    assert data['id'] == str(sample_session_id)
    assert data['capture_image_url'] is not None
    svc.capture_photo.assert_awaited_once()


@pytest.mark.asyncio
async def test_print_receipt_success(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/kiosk/session/{id}/print returns success when AI text exists."""
    mock_session = _make_mock_session(
        session_id=sample_session_id,
        state=KioskState.REVEAL,
        ai_response_text='Your vibe is cosmic turquoise!',
    )

    with (
        patch('app.api.v1.endpoints.kiosk.session_service') as svc,
        patch('app.services.printer_service.print_receipt', return_value={'success': True, 'message': 'Print sent'}),
    ):
        svc.get_session = AsyncMock(return_value=mock_session)

        resp = await client.post(
            f'/api/v1/kiosk/session/{sample_session_id}/print',
            json={'include_photo': False},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert 'message' in data


@pytest.mark.asyncio
async def test_print_receipt_no_ai_text(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/kiosk/session/{id}/print returns message when no AI response."""
    mock_session = _make_mock_session(
        session_id=sample_session_id,
        state=KioskState.CAPTURE,
        ai_response_text=None,
    )

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.get_session = AsyncMock(return_value=mock_session)

        resp = await client.post(f'/api/v1/kiosk/session/{sample_session_id}/print')

    assert resp.status_code == 200
    data = resp.json()
    assert 'No AI response' in data['message']


@pytest.mark.asyncio
async def test_print_receipt_printer_failure(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/kiosk/session/{id}/print returns failure message on printer error."""
    mock_session = _make_mock_session(
        session_id=sample_session_id,
        state=KioskState.REVEAL,
        ai_response_text='Your vibe is golden!',
    )

    with (
        patch('app.api.v1.endpoints.kiosk.session_service') as svc,
        patch('app.services.printer_service.print_receipt', side_effect=Exception('USB error')),
    ):
        svc.get_session = AsyncMock(return_value=mock_session)

        resp = await client.post(f'/api/v1/kiosk/session/{sample_session_id}/print')

    assert resp.status_code == 200
    data = resp.json()
    assert 'Print failed' in data['message']


@pytest.mark.asyncio
async def test_finish_session_returns_finish_response(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/kiosk/session/{id}/finish returns SessionFinishResponse."""
    finish_result = {
        'id': sample_session_id,
        'state': KioskState.RESET,
        'message': 'Session completed. All data cleared for privacy.',
        'duration_seconds': 42.5,
    }

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.finish_session = AsyncMock(return_value=finish_result)

        resp = await client.post(f'/api/v1/kiosk/session/{sample_session_id}/finish')

    assert resp.status_code == 200
    data = resp.json()
    assert data['id'] == str(sample_session_id)
    assert data['state'] == 'reset'
    assert data['duration_seconds'] == 42.5
    assert 'message' in data
    svc.finish_session.assert_awaited_once()


@pytest.mark.asyncio
async def test_invalid_state_transition_returns_409(client: AsyncClient, sample_session_id: uuid.UUID):
    """Attempting an invalid state transition returns 409."""
    from app.core.exceptions import StateTransitionError

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.get_session = AsyncMock(
            side_effect=StateTransitionError(KioskState.IDLE, KioskState.REVEAL)
        )

        resp = await client.get(f'/api/v1/kiosk/session/{sample_session_id}')

    assert resp.status_code == 409
    data = resp.json()
    assert data['error']['code'] == 'INVALID_STATE_TRANSITION'


@pytest.mark.asyncio
async def test_health_check_returns_200():
    """GET /health returns 200 with status ok."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://testserver') as client:
        resp = await client.get('/health')

    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'ok'
    assert 'version' in data
    assert 'uptime_seconds' in data


@pytest.mark.asyncio
async def test_full_kiosk_flow_without_payment(client: AsyncClient):
    """Exercise the full kiosk flow: create -> get -> capture -> finish."""
    session_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    fake_jpeg = b'\xff\xd8\xff\xe0' + b'\x00' * 100 + b'\xff\xd9'

    # Step 1: Create session
    mock_idle = _make_mock_session(session_id=session_id, state=KioskState.IDLE, created_at=now)

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.create_session = AsyncMock(return_value=mock_idle)
        resp = await client.post('/api/v1/kiosk/session', json={'payment_enabled': False})

    assert resp.status_code == 201
    assert resp.json()['state'] == 'idle'

    # Step 2: Get session
    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.get_session = AsyncMock(return_value=mock_idle)
        resp = await client.get(f'/api/v1/kiosk/session/{session_id}')

    assert resp.status_code == 200
    assert resp.json()['state'] == 'idle'

    # Step 3: Capture photo
    mock_processing = _make_mock_session(
        session_id=session_id,
        state=KioskState.PROCESSING,
        created_at=now,
    )

    with (
        patch('app.api.v1.endpoints.kiosk.session_service') as svc,
        patch('app.services.camera_service.capture_frame', new_callable=AsyncMock, return_value=fake_jpeg),
    ):
        svc.capture_photo = AsyncMock(return_value=mock_processing)
        resp = await client.post(f'/api/v1/kiosk/session/{session_id}/capture')

    assert resp.status_code == 200
    assert resp.json()['state'] == 'processing'

    # Step 4: Finish session
    finish_result = {
        'id': session_id,
        'state': KioskState.RESET,
        'message': 'Session completed. All data cleared for privacy.',
        'duration_seconds': 15.0,
    }

    with patch('app.api.v1.endpoints.kiosk.session_service') as svc:
        svc.finish_session = AsyncMock(return_value=finish_result)
        resp = await client.post(f'/api/v1/kiosk/session/{session_id}/finish')

    assert resp.status_code == 200
    data = resp.json()
    assert data['state'] == 'reset'
    assert data['duration_seconds'] == 15.0
