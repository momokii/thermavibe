"""Unit tests for analytics service -- event recording and analytics queries."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.analytics import AnalyticsEvent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_db() -> AsyncMock:
    """Create a mock AsyncSession."""
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.execute = AsyncMock()
    return db


def _make_mock_event(
    event_id: uuid.UUID | None = None,
    event_type: str = 'session_start',
    session_id: uuid.UUID | None = None,
    metadata: dict | None = None,
) -> MagicMock:
    """Create a mock AnalyticsEvent."""
    event = MagicMock(spec=AnalyticsEvent)
    event.id = event_id or uuid.uuid4()
    event.session_id = session_id
    event.event_type = event_type
    event.metadata_ = metadata or {}
    event.timestamp = datetime.now(timezone.utc)
    return event


def _mock_scalar(value):
    """Create a mock result that returns value from scalar()."""
    result = MagicMock()
    result.scalar.return_value = value
    return result


def _mock_scalar_none():
    """Create a mock result that returns None from scalar()."""
    result = MagicMock()
    result.scalar.return_value = None
    return result


def _mock_one(**kwargs):
    """Create a mock result that returns a named tuple from one()."""
    result = MagicMock()

    class Row:
        def __init__(self, **fields):
            for k, v in fields.items():
                setattr(self, k, v)

    result.one.return_value = Row(**kwargs)
    return result


def _mock_all(rows):
    """Create a mock result that returns rows from all()."""
    result = MagicMock()
    result.all.return_value = rows
    return result


# ---------------------------------------------------------------------------
# record_event
# ---------------------------------------------------------------------------


class TestRecordEvent:
    """Tests for record_event()."""

    async def test_creates_event(self):
        """record_event creates an AnalyticsEvent with correct event_type."""
        db = _make_mock_db()
        mock_event = _make_mock_event(event_type='session_start')

        def refresh_side_effect(obj):
            obj.id = mock_event.id
            obj.timestamp = mock_event.timestamp

        db.refresh.side_effect = refresh_side_effect

        from app.services.analytics_service import record_event

        result = await record_event(db, event_type='session_start')

        db.add.assert_called_once()
        db.commit.assert_awaited_once()
        assert result.event_type == 'session_start'

    async def test_with_session_id(self):
        """record_event with session_id stores it on the event."""
        db = _make_mock_db()
        session_id = uuid.uuid4()

        def refresh_side_effect(obj):
            obj.id = uuid.uuid4()

        db.refresh.side_effect = refresh_side_effect

        from app.services.analytics_service import record_event

        result = await record_event(db, event_type='capture_complete', session_id=str(session_id))

        db.add.assert_called_once()
        # The event should have been created with the session_id
        added_event = db.add.call_args[0][0]
        assert added_event.session_id == session_id

    async def test_with_metadata(self):
        """record_event with metadata stores it on the event."""
        db = _make_mock_db()

        def refresh_side_effect(obj):
            obj.id = uuid.uuid4()

        db.refresh.side_effect = refresh_side_effect

        from app.services.analytics_service import record_event

        meta = {'provider': 'openai', 'model': 'gpt-4o'}
        result = await record_event(db, event_type='ai_response_received', metadata=meta)

        db.add.assert_called_once()
        added_event = db.add.call_args[0][0]
        assert added_event.metadata_ == meta


# ---------------------------------------------------------------------------
# get_session_analytics
# ---------------------------------------------------------------------------


class TestGetSessionAnalytics:
    """Tests for get_session_analytics()."""

    async def test_empty_returns_zero_totals(self):
        """get_session_analytics with no sessions returns zero for all totals."""
        db = _make_mock_db()

        # All count queries return 0, avg returns None
        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx <= 3:
                # total count, completed count, avg duration
                return _mock_scalar(0)
            if call_idx == 4:
                # state distribution
                return _mock_all([])
            # timeseries (uses date_trunc - mock as empty)
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_session_analytics

        result = await get_session_analytics(db)

        assert result.summary.total_sessions == 0
        assert result.summary.completed_sessions == 0
        assert result.summary.abandoned_sessions == 0
        assert result.summary.completion_rate == 0.0
        assert result.summary.avg_duration_seconds == 0.0

    async def test_with_sessions(self):
        """get_session_analytics with sessions returns correct summary."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                # total count
                return _mock_scalar(10)
            if call_idx == 2:
                # completed count
                return _mock_scalar(7)
            if call_idx == 3:
                # avg duration
                return _mock_scalar(45.5)
            if call_idx == 4:
                # state distribution
                state_rows = [('idle', 1), ('capture', 2), ('processing', 1)]
                return _mock_all(state_rows)
            # timeseries (date_trunc - mock empty to avoid PG-specific issues)
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_session_analytics

        result = await get_session_analytics(db)

        assert result.summary.total_sessions == 10
        assert result.summary.completed_sessions == 7
        assert result.summary.abandoned_sessions == 3  # 10 - 7
        assert result.summary.completion_rate == 70.0
        assert result.summary.avg_duration_seconds == 45.5
        assert result.state_distribution == {'idle': 1, 'capture': 2, 'processing': 1}


# ---------------------------------------------------------------------------
# get_revenue_analytics
# ---------------------------------------------------------------------------


class TestGetRevenueAnalytics:
    """Tests for get_revenue_analytics()."""

    async def test_no_payments_returns_zero(self):
        """get_revenue_analytics with no payments returns zero totals."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                # revenue summary row
                return _mock_one(tx_count=0, total=0, avg=0)
            # timeseries
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_revenue_analytics

        result = await get_revenue_analytics(db)

        assert result.summary.total_revenue == 0
        assert result.summary.total_transactions == 0
        assert result.summary.avg_transaction_amount == 0
        assert result.summary.currency == 'IDR'
        assert result.summary.refund_count == 0
        assert result.summary.refund_total == 0
        assert len(result.timeseries) == 0

    async def test_with_payments(self):
        """get_revenue_analytics with payments returns correct totals."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                # revenue summary row
                return _mock_one(tx_count=5, total=25000, avg=5000)
            # timeseries
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_revenue_analytics

        result = await get_revenue_analytics(db)

        assert result.summary.total_transactions == 5
        assert result.summary.total_revenue == 25000
        assert result.summary.avg_transaction_amount == 5000
        assert result.summary.currency == 'IDR'
