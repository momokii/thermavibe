"""Unit tests for retention service -- purge logic, thumbnail detection, safety."""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.session import KioskSession, SessionType
from app.services.retention_service import (
    _find_thumbnail,
    _safe_remove,
    get_auto_cleanup_interval_hours,
    purge_expired_sessions,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_db() -> AsyncMock:
    """Create a mock AsyncSession."""
    db = AsyncMock()
    db.commit = AsyncMock()
    db.execute = AsyncMock()
    return db


def _make_session(
    session_type: SessionType,
    created_at: datetime,
    photo_path: str | None = None,
    composite_image_path: str | None = None,
    ai_response_text: str | None = None,
) -> MagicMock:
    """Create a mock KioskSession."""
    session = MagicMock(spec=KioskSession)
    session.session_type = session_type
    session.created_at = created_at
    session.photo_path = photo_path
    session.composite_image_path = composite_image_path
    session.ai_response_text = ai_response_text
    session.ai_provider_used = 'mock' if ai_response_text else None
    return session


def _mock_scalar_result(rows: list):
    """Create a mock result that returns rows from scalars().all()."""
    scalars = MagicMock()
    scalars.all.return_value = rows
    result = MagicMock()
    result.scalars.return_value = scalars
    return result


def _mock_config_result(config: dict):
    """Create a mock result for get_configs_by_category."""
    # This returns a dict, not a DB result
    return config


# ---------------------------------------------------------------------------
# _safe_remove
# ---------------------------------------------------------------------------


class TestSafeRemove:
    def test_removes_existing_file(self, tmp_path):
        f = tmp_path / 'test.jpg'
        f.write_text('data')
        assert _safe_remove(str(f)) is True
        assert not f.exists()

    def test_returns_false_for_missing_file(self):
        assert _safe_remove('/nonexistent/path.jpg') is False

    def test_handles_permission_error(self, tmp_path):
        f = tmp_path / 'locked.jpg'
        f.write_text('data')
        with patch('os.remove', side_effect=PermissionError('denied')):
            assert _safe_remove(str(f)) is False


# ---------------------------------------------------------------------------
# _find_thumbnail
# ---------------------------------------------------------------------------


class TestFindThumbnail:
    def test_photobooth_composite(self):
        result = _find_thumbnail('/tmp/vibeprint/vibeprint_composite_abc123.jpg')
        assert result == '/tmp/vibeprint/vibeprint_thumb_abc123.jpg'

    def test_vibe_check_photo(self):
        result = _find_thumbnail('/tmp/vibeprint/vibeprint_xyz789.jpg')
        assert result == '/tmp/vibeprint/vibeprint_thumb_xyz789.jpg'

    def test_unknown_naming_returns_none(self):
        result = _find_thumbnail('/tmp/other/photo.jpg')
        assert result is None


# ---------------------------------------------------------------------------
# purge_expired_sessions
# ---------------------------------------------------------------------------


class TestPurgeExpiredSessions:
    """Test the main purge function."""

    @pytest.fixture
    def mock_db(self):
        return _make_mock_db()

    @pytest.fixture
    def now(self):
        return datetime.now(timezone.utc)

    def _setup_config_mock(self, pb_retention='168', vc_retention='168'):
        """Return a side_effect function that returns config dicts by category."""
        configs = {
            'photobooth': {'photobooth_composite_retention_hours': pb_retention},
            'vibe_check': {'vibe_check_retention_hours': vc_retention},
        }

        async def _get_config(db, category):
            return configs.get(category, {})

        return _get_config

    @pytest.mark.asyncio
    async def test_skips_when_retention_zero(self, mock_db, now):
        """Retention of 0 means keep forever — nothing should be purged."""
        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            mock_config.side_effect = self._setup_config_mock('0', '0')

            # Return some expired sessions
            mock_db.execute.return_value = _mock_scalar_result([
                _make_session(SessionType.PHOTOBOOTH, now - timedelta(days=10),
                              composite_image_path='/tmp/test.jpg'),
            ])

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 0, 'vibe_check_purged': 0}
        mock_db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_deletes_photobooth_composites(self, mock_db, tmp_path, now):
        """Expired photobooth sessions should have composites + thumbnails deleted."""
        composite = tmp_path / 'vibeprint_composite_abc.jpg'
        thumb = tmp_path / 'vibeprint_thumb_abc.jpg'
        composite.write_text('composite')
        thumb.write_text('thumb')

        old_session = _make_session(
            SessionType.PHOTOBOOTH,
            now - timedelta(days=10),
            composite_image_path=str(composite),
        )

        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            mock_config.side_effect = self._setup_config_mock('168', '168')

            # First call for photobooth query, second for vibe_check (empty)
            call_count = 0

            def execute_side_effect(stmt):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return _mock_scalar_result([old_session])
                return _mock_scalar_result([])

            mock_db.execute.side_effect = execute_side_effect

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 1, 'vibe_check_purged': 0}
        assert not composite.exists()
        assert not thumb.exists()
        assert old_session.composite_image_path is None
        mock_db.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_deletes_vibe_check_photos(self, mock_db, tmp_path, now):
        """Expired vibe check sessions should have photos + AI text cleared."""
        photo = tmp_path / 'vibeprint_xyz.jpg'
        thumb = tmp_path / 'vibeprint_thumb_xyz.jpg'
        photo.write_text('photo')
        thumb.write_text('thumb')

        old_session = _make_session(
            SessionType.VIBE_CHECK,
            now - timedelta(days=10),
            photo_path=str(photo),
            ai_response_text='Great vibes!',
        )

        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            mock_config.side_effect = self._setup_config_mock('168', '168')

            call_count = 0

            def execute_side_effect(stmt):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return _mock_scalar_result([])  # No photobooth
                return _mock_scalar_result([old_session])  # One vibe check

            mock_db.execute.side_effect = execute_side_effect

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 0, 'vibe_check_purged': 1}
        assert not photo.exists()
        assert not thumb.exists()
        assert old_session.photo_path is None
        assert old_session.ai_response_text is None
        assert old_session.ai_provider_used is None

    @pytest.mark.asyncio
    async def test_preserves_recent_sessions(self, mock_db, now):
        """Sessions newer than retention period should not be touched."""
        recent_session = _make_session(
            SessionType.PHOTOBOOTH,
            now - timedelta(hours=1),  # Only 1 hour old
            composite_image_path='/tmp/recent.jpg',
        )

        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            mock_config.side_effect = self._setup_config_mock('168', '168')

            call_count = 0

            def execute_side_effect(stmt):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    # Query returns nothing because created_at > cutoff
                    return _mock_scalar_result([])
                return _mock_scalar_result([])

            mock_db.execute.side_effect = execute_side_effect

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 0, 'vibe_check_purged': 0}
        assert recent_session.composite_image_path == '/tmp/recent.jpg'

    @pytest.mark.asyncio
    async def test_handles_missing_files_gracefully(self, mock_db, now):
        """Should not crash if files are already gone."""
        old_session = _make_session(
            SessionType.PHOTOBOOTH,
            now - timedelta(days=10),
            composite_image_path='/nonexistent/file.jpg',
        )

        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            mock_config.side_effect = self._setup_config_mock('168', '168')

            call_count = 0

            def execute_side_effect(stmt):
                nonlocal call_count
                call_count += 1
                if call_count == 1:
                    return _mock_scalar_result([old_session])
                return _mock_scalar_result([])

            mock_db.execute.side_effect = execute_side_effect

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 1, 'vibe_check_purged': 0}
        assert old_session.composite_image_path is None

    @pytest.mark.asyncio
    async def test_no_commit_when_nothing_purged(self, mock_db, now):
        """Should not commit if nothing was purged."""
        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            mock_config.side_effect = self._setup_config_mock('168', '168')

            mock_db.execute.return_value = _mock_scalar_result([])

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 0, 'vibe_check_purged': 0}
        mock_db.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_reads_retention_from_config(self, mock_db, now):
        """Should use retention hours from DB config, not hardcoded values."""
        old_session = _make_session(
            SessionType.VIBE_CHECK,
            now - timedelta(hours=2),  # 2 hours old
            photo_path='/tmp/test.jpg',
            ai_response_text='vibes',
        )

        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            # Set vibe check retention to 1 hour — session is 2 hours old, should be purged
            # Photobooth retention is 0 (forever), so it's skipped entirely (no DB query)
            mock_config.side_effect = self._setup_config_mock('0', '1')

            # Only one execute call happens (vibe check), photobooth is skipped
            mock_db.execute.return_value = _mock_scalar_result([old_session])

            result = await purge_expired_sessions(mock_db)

        assert result == {'photobooth_purged': 0, 'vibe_check_purged': 1}


# ---------------------------------------------------------------------------
# get_auto_cleanup_interval_hours
# ---------------------------------------------------------------------------


class TestGetAutoCleanupIntervalHours:
    @pytest.mark.asyncio
    async def test_uses_shorter_retention_period(self):
        db = _make_mock_db()
        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            configs = {
                'photobooth': {'photobooth_composite_retention_hours': '48'},
                'vibe_check': {'vibe_check_retention_hours': '24'},
            }

            async def _get_config(d, category):
                return configs.get(category, {})

            mock_config.side_effect = _get_config

            result = await get_auto_cleanup_interval_hours(db)

        assert result == 24  # Shorter of 48 and 24

    @pytest.mark.asyncio
    async def test_ignores_zero_periods(self):
        db = _make_mock_db()
        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            configs = {
                'photobooth': {'photobooth_composite_retention_hours': '0'},  # Forever
                'vibe_check': {'vibe_check_retention_hours': '12'},
            }

            async def _get_config(d, category):
                return configs.get(category, {})

            mock_config.side_effect = _get_config

            result = await get_auto_cleanup_interval_hours(db)

        assert result == 12  # Only active period

    @pytest.mark.asyncio
    async def test_falls_back_when_both_zero(self):
        db = _make_mock_db()
        with patch('app.services.retention_service.get_configs_by_category') as mock_config:
            configs = {
                'photobooth': {'photobooth_composite_retention_hours': '0'},
                'vibe_check': {'vibe_check_retention_hours': '0'},
            }

            async def _get_config(d, category):
                return configs.get(category, {})

            mock_config.side_effect = _get_config

            result = await get_auto_cleanup_interval_hours(db)

        assert result == 6  # FALLBACK_INTERVAL_HOURS
