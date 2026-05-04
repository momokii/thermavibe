"""Unit tests for analytics service -- event recording, analytics queries, feature breakdown."""

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

        from app.services.analytics_service import record_event

        result = await record_event(db, event_type='session_start')

        db.add.assert_called_once()
        added_event = db.add.call_args[0][0]
        assert added_event.event_type == 'session_start'
        assert db.commit.await_count == 1

    async def test_creates_event_with_session_id(self):
        """record_event sets session_id when provided."""
        db = _make_mock_db()
        sid = str(uuid.uuid4())

        from app.services.analytics_service import record_event

        await record_event(db, event_type='capture', session_id=sid)

        added_event = db.add.call_args[0][0]
        assert str(added_event.session_id) == sid

    async def test_creates_event_with_metadata(self):
        """record_event sets metadata_ when provided."""
        db = _make_mock_db()
        meta = {'photo_index': 2, 'from_state': 'capture'}

        from app.services.analytics_service import record_event

        await record_event(db, event_type='photo_selected', metadata=meta)

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
            # timeseries
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_session_analytics

        result = await get_session_analytics(db)

        assert result.summary.total_sessions == 0
        assert result.summary.completed_sessions == 0
        assert result.summary.completion_rate == 0.0
        assert result.summary.avg_duration_seconds == 0.0

    async def test_with_sessions(self):
        """get_session_analytics with sessions returns correct metrics."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                return _mock_scalar(10)  # total
            if call_idx == 2:
                return _mock_scalar(8)  # completed
            if call_idx == 3:
                return _mock_scalar(15.5)  # avg duration
            if call_idx == 4:
                return _mock_all([('idle', 3), ('reset', 7)])  # state dist
            # timeseries
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_session_analytics

        result = await get_session_analytics(db)

        assert result.summary.total_sessions == 10
        assert result.summary.completed_sessions == 8
        assert result.summary.abandoned_sessions == 2
        assert result.summary.completion_rate == 0.8
        assert result.summary.avg_duration_seconds == 15.5
        assert result.state_distribution == {'idle': 3, 'reset': 7}


# ---------------------------------------------------------------------------
# get_revenue_analytics
# ---------------------------------------------------------------------------


class TestGetRevenueAnalytics:
    """Tests for get_revenue_analytics()."""

    async def test_empty_returns_zero_totals(self):
        """get_revenue_analytics with no transactions returns zero for all fields."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                # payment summary
                return _mock_one(tx_count=0, total=0)
            if call_idx == 2:
                # access code summary
                return _mock_one(tx_count=0, total=0)
            # timeseries
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_revenue_analytics

        result = await get_revenue_analytics(db)

        assert result.summary.total_revenue == 0
        assert result.summary.total_transactions == 0
        assert result.summary.payment_revenue == 0
        assert result.summary.access_code_revenue == 0

    async def test_with_payment_and_access_code_revenue(self):
        """get_revenue_analytics correctly separates payment and access code revenue."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                # payment summary: 3 transactions, 15000 total
                return _mock_one(tx_count=3, total=15000)
            if call_idx == 2:
                # access code summary: 2 transactions, 10000 total
                return _mock_one(tx_count=2, total=10000)
            # timeseries
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_revenue_analytics

        result = await get_revenue_analytics(db)

        assert result.summary.payment_revenue == 15000
        assert result.summary.payment_transactions == 3
        assert result.summary.access_code_revenue == 10000
        assert result.summary.access_code_transactions == 2
        assert result.summary.total_revenue == 25000
        assert result.summary.total_transactions == 5
        assert result.summary.avg_transaction_amount == 5000
        assert result.summary.currency == 'IDR'
        assert 'payment' in result.by_entry_method
        assert result.by_entry_method['payment'].revenue == 15000
        assert 'access_code' in result.by_entry_method
        assert result.by_entry_method['access_code'].revenue == 10000

    async def test_payment_only(self):
        """get_revenue_analytics with only payment revenue, no access codes."""
        db = _make_mock_db()

        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx == 1:
                return _mock_one(tx_count=4, total=20000)
            if call_idx == 2:
                return _mock_one(tx_count=0, total=0)
            return _mock_all([])

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_revenue_analytics

        result = await get_revenue_analytics(db)

        assert result.summary.payment_revenue == 20000
        assert result.summary.access_code_revenue == 0
        assert 'payment' in result.by_entry_method
        assert 'access_code' not in result.by_entry_method


# ---------------------------------------------------------------------------
# get_feature_breakdown
# ---------------------------------------------------------------------------


class TestGetFeatureBreakdown:
    """Tests for get_feature_breakdown()."""

    async def test_returns_both_features_when_empty(self):
        """Returns both vibe_check and photobooth even with no sessions."""
        db = _make_mock_db()

        # For each session_type: total, completed, avg, payment_revenue, access_code_revenue
        # = 5 calls per type, 10 total
        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            call_idx += 1
            if call_idx in (3, 8):
                # avg duration returns None when no sessions
                return _mock_scalar(None)
            return _mock_scalar(0)

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_feature_breakdown

        result = await get_feature_breakdown(db)

        assert len(result.features) == 2
        assert result.features[0].feature == 'vibe_check'
        assert result.features[1].feature == 'photobooth'
        for f in result.features:
            assert f.total_sessions == 0
            assert f.completed_sessions == 0
            assert f.completion_rate == 0.0
            assert f.payment_revenue == 0
            assert f.access_code_revenue == 0

    async def test_separates_session_types_with_entry_methods(self):
        """Correctly separates vibe_check and photobooth metrics with entry method revenue."""
        db = _make_mock_db()

        # vibe_check: total=5, completed=4, avg=12.0, payment_rev=8000, ac_rev=2000
        # photobooth: total=3, completed=2, avg=25.0, payment_rev=4000, ac_rev=2000
        values = [
            5, 4, 12.0, 8000, 2000,   # vibe_check: total, completed, avg, payment_rev, ac_rev
            3, 2, 25.0, 4000, 2000,   # photobooth: total, completed, avg, payment_rev, ac_rev
        ]
        call_idx = 0

        def execute_side_effect(stmt):
            nonlocal call_idx
            val = values[call_idx]
            call_idx += 1
            return _mock_scalar(val)

        db.execute.side_effect = execute_side_effect

        from app.services.analytics_service import get_feature_breakdown

        result = await get_feature_breakdown(db)

        vc = result.features[0]
        assert vc.feature == 'vibe_check'
        assert vc.total_sessions == 5
        assert vc.completed_sessions == 4
        assert vc.abandoned_sessions == 1
        assert vc.completion_rate == 0.8
        assert vc.avg_duration_seconds == 12.0
        assert vc.revenue == 10000
        assert vc.payment_revenue == 8000
        assert vc.access_code_revenue == 2000

        pb = result.features[1]
        assert pb.feature == 'photobooth'
        assert pb.total_sessions == 3
        assert pb.completed_sessions == 2
        assert pb.abandoned_sessions == 1
        assert pb.completion_rate == pytest.approx(0.67, abs=0.01)
        assert pb.avg_duration_seconds == 25.0
        assert pb.revenue == 6000
        assert pb.payment_revenue == 4000
        assert pb.access_code_revenue == 2000
