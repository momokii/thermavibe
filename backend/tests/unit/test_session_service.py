"""Unit tests for session service -- state machine transitions, session lifecycle."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy import select

from app.core.exceptions import SessionNotFoundError, StateTransitionError
from app.models.session import KioskSession, KioskState, PaymentStatus


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_session(
    session_id: uuid.UUID | None = None,
    state: str = KioskState.IDLE,
    payment_status: str | None = PaymentStatus.NONE,
    photo_path: str | None = None,
    ai_response_text: str | None = None,
    ai_provider_used: str | None = None,
    created_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> MagicMock:
    """Create a mock KioskSession with sensible defaults."""
    sess = MagicMock(spec=KioskSession)
    sess.id = session_id or uuid.uuid4()
    sess.state = state
    sess.payment_status = payment_status
    sess.payment_provider = None
    sess.payment_amount = None
    sess.payment_reference = None
    sess.photo_path = photo_path
    sess.ai_response_text = ai_response_text
    sess.ai_provider_used = ai_provider_used
    sess.created_at = created_at or datetime.now(timezone.utc)
    sess.completed_at = completed_at
    sess.cleared_at = None
    return sess


def _make_mock_db() -> AsyncMock:
    """Create a mock AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


def _mock_scalar_result(value):
    """Create a mock result that returns value from scalar_one_or_none()."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _mock_scalars_result(values):
    """Create a mock result that returns list from scalars().all()."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


def _mock_scalar(value):
    """Create a mock result that returns value from scalar()."""
    result = MagicMock()
    result.scalar.return_value = value
    return result


# ---------------------------------------------------------------------------
# create_session
# ---------------------------------------------------------------------------


class TestCreateSession:
    """Tests for create_session()."""

    async def test_creates_idle_session(self):
        """create_session produces a session in IDLE state."""
        db = _make_mock_db()
        new_session = _make_mock_session(state=KioskState.IDLE, payment_status=PaymentStatus.NONE)
        db.refresh.side_effect = lambda obj: setattr(obj, 'id', new_session.id)

        from app.services.session_service import create_session

        result = await create_session(db)

        assert result.state == KioskState.IDLE
        db.add.assert_called()
        db.commit.assert_awaited_once()

    async def test_create_session_with_payment_enabled(self):
        """create_session with payment_enabled=True sets payment_status to None."""
        db = _make_mock_db()
        new_session = _make_mock_session(state=KioskState.IDLE, payment_status=None)
        db.refresh.side_effect = lambda obj: setattr(obj, 'id', new_session.id)

        from app.services.session_service import create_session

        result = await create_session(db, payment_enabled=True)

        assert result.state == KioskState.IDLE
        db.add.assert_called()
        db.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# get_session
# ---------------------------------------------------------------------------


class TestGetSession:
    """Tests for get_session()."""

    async def test_returns_existing_session(self):
        """get_session returns the session when it exists."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.CAPTURE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import get_session

        result = await get_session(db, session_id)

        assert result.id == session_id
        assert result.state == KioskState.CAPTURE

    async def test_raises_for_bad_id(self):
        """get_session raises SessionNotFoundError when session does not exist."""
        db = _make_mock_db()
        db.execute.return_value = _mock_scalar_result(None)

        from app.services.session_service import get_session

        with pytest.raises(SessionNotFoundError):
            await get_session(db, uuid.uuid4())


# ---------------------------------------------------------------------------
# transition_state
# ---------------------------------------------------------------------------


class TestTransitionState:
    """Tests for transition_state()."""

    async def test_valid_idle_to_capture(self):
        """Transition from IDLE to CAPTURE succeeds."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        result = await transition_state(db, session_id, KioskState.CAPTURE)

        assert mock_session.state == KioskState.CAPTURE
        db.commit.assert_awaited()

    async def test_valid_capture_to_processing(self):
        """Transition from CAPTURE to PROCESSING succeeds."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.CAPTURE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        result = await transition_state(db, session_id, KioskState.PROCESSING)

        assert mock_session.state == KioskState.PROCESSING

    async def test_valid_processing_to_reveal(self):
        """Transition from PROCESSING to REVEAL succeeds."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.PROCESSING)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        result = await transition_state(db, session_id, KioskState.REVEAL)

        assert mock_session.state == KioskState.REVEAL
        assert mock_session.completed_at is not None

    async def test_valid_reveal_to_reset(self):
        """Transition from REVEAL to RESET succeeds."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.REVEAL)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        result = await transition_state(db, session_id, KioskState.RESET)

        assert mock_session.state == KioskState.RESET
        assert mock_session.photo_path is None  # _clear_session_data called

    async def test_valid_idle_to_payment(self):
        """Transition from IDLE to PAYMENT succeeds."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        result = await transition_state(db, session_id, KioskState.PAYMENT)

        assert mock_session.state == KioskState.PAYMENT

    async def test_invalid_transition_raises(self):
        """Transition from IDLE directly to REVEAL raises StateTransitionError."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        with pytest.raises(StateTransitionError):
            await transition_state(db, session_id, KioskState.REVEAL)

    async def test_idempotent_self_transition(self):
        """Transitioning to the same state returns the session unchanged."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import transition_state

        result = await transition_state(db, session_id, KioskState.IDLE)

        assert result is mock_session
        db.commit.assert_not_awaited()


# ---------------------------------------------------------------------------
# start_session
# ---------------------------------------------------------------------------


class TestStartSession:
    """Tests for start_session()."""

    async def test_without_payment_goes_to_capture(self):
        """start_session without payment transitions to CAPTURE."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import start_session

        result = await start_session(db, session_id, payment_enabled=False)

        assert mock_session.state == KioskState.CAPTURE

    async def test_with_payment_goes_to_payment(self):
        """start_session with payment_enabled transitions to PAYMENT."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import start_session

        result = await start_session(db, session_id, payment_enabled=True)

        assert mock_session.state == KioskState.PAYMENT


# ---------------------------------------------------------------------------
# capture_photo
# ---------------------------------------------------------------------------


class TestCapturePhoto:
    """Tests for capture_photo()."""

    async def test_records_path_and_transitions(self):
        """capture_photo stores photo_path and transitions to PROCESSING."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.CAPTURE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import capture_photo

        result = await capture_photo(db, session_id, photo_path='/tmp/photo.jpg')

        assert mock_session.photo_path == '/tmp/photo.jpg'
        assert mock_session.state == KioskState.PROCESSING
        db.commit.assert_awaited()

    async def test_wrong_state_raises(self):
        """capture_photo raises when session is not in CAPTURE state."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.IDLE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import capture_photo

        with pytest.raises(StateTransitionError):
            await capture_photo(db, session_id, photo_path='/tmp/photo.jpg')


# ---------------------------------------------------------------------------
# store_ai_response
# ---------------------------------------------------------------------------


class TestStoreAIResponse:
    """Tests for store_ai_response()."""

    async def test_stores_text_and_transitions(self):
        """store_ai_response stores AI text, provider, and transitions to REVEAL."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.PROCESSING)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import store_ai_response

        result = await store_ai_response(db, session_id, 'You are radiant!', 'openai')

        assert mock_session.ai_response_text == 'You are radiant!'
        assert mock_session.ai_provider_used == 'openai'
        assert mock_session.state == KioskState.REVEAL
        assert mock_session.completed_at is not None


# ---------------------------------------------------------------------------
# record_payment
# ---------------------------------------------------------------------------


class TestRecordPayment:
    """Tests for record_payment()."""

    async def test_confirmed_auto_transitions_to_capture(self):
        """Confirmed payment in PAYMENT state auto-transitions to CAPTURE."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.PAYMENT)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import record_payment

        result = await record_payment(
            db, session_id, provider='midtrans', amount=5000, reference='REF123',
        )

        assert mock_session.payment_status == PaymentStatus.CONFIRMED
        assert mock_session.payment_provider == 'midtrans'
        assert mock_session.payment_amount == 5000
        assert mock_session.payment_reference == 'REF123'
        assert mock_session.state == KioskState.CAPTURE

    async def test_pending_does_not_transition(self):
        """Pending payment does not auto-transition."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.PAYMENT)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import record_payment

        result = await record_payment(
            db, session_id, provider='midtrans', amount=5000, reference='REF123',
            status=PaymentStatus.PENDING,
        )

        assert mock_session.payment_status == PaymentStatus.PENDING
        assert mock_session.state == KioskState.PAYMENT


# ---------------------------------------------------------------------------
# finish_session
# ---------------------------------------------------------------------------


class TestFinishSession:
    """Tests for finish_session()."""

    async def test_returns_dict_with_duration(self):
        """finish_session returns dict with session_id, state, message, and duration."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        created = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.REVEAL, created_at=created)
        mock_session.completed_at = datetime(2025, 1, 1, 12, 0, 30, tzinfo=timezone.utc)

        # First call: get_session (for finish_session's get_session)
        # Second call: get_session (inside transition_state)
        # Third call: get_session (inside transition_state again via _clear_session_data)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import finish_session

        result = await finish_session(db, session_id)

        assert result['id'] == session_id
        assert result['state'] == KioskState.RESET
        assert 'duration_seconds' in result
        assert result['duration_seconds'] >= 0


# ---------------------------------------------------------------------------
# get_active_session
# ---------------------------------------------------------------------------


class TestGetActiveSession:
    """Tests for get_active_session()."""

    async def test_finds_non_reset_session(self):
        """get_active_session returns a session that is not in RESET state."""
        db = _make_mock_db()
        session_id = uuid.uuid4()
        mock_session = _make_mock_session(session_id=session_id, state=KioskState.CAPTURE)
        db.execute.return_value = _mock_scalar_result(mock_session)

        from app.services.session_service import get_active_session

        result = await get_active_session(db)

        assert result is not None
        assert result.state != KioskState.RESET

    async def test_returns_none_when_all_reset(self):
        """get_active_session returns None when all sessions are in RESET state."""
        db = _make_mock_db()
        db.execute.return_value = _mock_scalar_result(None)

        from app.services.session_service import get_active_session

        result = await get_active_session(db)

        assert result is None


# ---------------------------------------------------------------------------
# VALID_TRANSITIONS map
# ---------------------------------------------------------------------------


class TestValidTransitionsMap:
    """Verify the transition map structure."""

    def test_all_states_have_entries(self):
        """Every KioskState value should have an entry in VALID_TRANSITIONS."""
        from app.services.session_service import VALID_TRANSITIONS

        for state in KioskState:
            assert state.value in VALID_TRANSITIONS, f'{state.value} missing from VALID_TRANSITIONS'

    def test_reset_transitions_to_idle(self):
        """RESET state should be able to transition to IDLE."""
        from app.services.session_service import VALID_TRANSITIONS

        assert KioskState.IDLE in VALID_TRANSITIONS[KioskState.RESET]
