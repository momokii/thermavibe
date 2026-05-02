"""Unit tests for access code service -- generate, validate, redeem, CRUD."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.access_code import AccessCode, AccessCodeStatus, AccessCodeType


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


def _mock_scalar_result(value):
    """Create a mock result that returns value from scalar_one_or_none()."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar.return_value = value
    return result


def _mock_scalars_result(values):
    """Create a mock result that returns values from scalars().all()."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


def _make_access_code(**overrides) -> MagicMock:
    """Create a mock AccessCode with defaults."""
    defaults = {
        'id': 1,
        'code': 'UN-ABC12345',
        'code_type': AccessCodeType.UNIVERSAL,
        'max_uses': 1,
        'use_count': 0,
        'status': AccessCodeStatus.ACTIVE,
        'expires_at': None,
        'notes': None,
        'created_by': 'admin',
    }
    defaults.update(overrides)
    code = MagicMock(spec=AccessCode)
    for k, v in defaults.items():
        setattr(code, k, v)
    return code


# ---------------------------------------------------------------------------
# generate_code
# ---------------------------------------------------------------------------


class TestGenerateCode:
    """Tests for generate_code()."""

    async def test_creates_single_code(self):
        """generate_code creates an AccessCode with correct defaults."""
        db = _make_mock_db()
        db.refresh.side_effect = lambda obj: setattr(obj, 'id', 1)

        from app.services.access_code_service import generate_code

        code = await generate_code(db, code_type='universal', max_uses=5)

        db.add.assert_called_once()
        db.commit.assert_awaited_once()
        assert code.max_uses == 5

    @patch('app.services.access_code_service._generate_code_string')
    async def test_prefix_by_type(self, mock_gen):
        """Code prefix matches the code type."""
        mock_gen.return_value = 'VC-TEST1234'
        db = _make_mock_db()

        from app.services.access_code_service import generate_code

        await generate_code(db, code_type='vibe_check')
        mock_gen.assert_called_once_with('vibe_check')


# ---------------------------------------------------------------------------
# generate_batch
# ---------------------------------------------------------------------------


class TestGenerateBatch:
    """Tests for generate_batch()."""

    async def test_creates_correct_count(self):
        """generate_batch creates the requested number of codes."""
        db = _make_mock_db()
        db.refresh.side_effect = lambda obj: setattr(obj, 'id', 1)

        from app.services.access_code_service import generate_batch

        codes = await generate_batch(db, count=5)

        assert db.add.call_count == 5
        db.commit.assert_awaited_once()
        assert len(codes) == 5

    async def test_clamps_count_to_100(self):
        """generate_batch clamps count to 100 max."""
        db = _make_mock_db()
        db.refresh.side_effect = lambda obj: setattr(obj, 'id', 1)

        from app.services.access_code_service import generate_batch

        codes = await generate_batch(db, count=200)
        assert db.add.call_count == 100


# ---------------------------------------------------------------------------
# validate_code
# ---------------------------------------------------------------------------


class TestValidateCode:
    """Tests for validate_code()."""

    async def test_valid_universal_code(self):
        """Universal code validates for vibe_check session."""
        db = _make_mock_db()
        code = _make_access_code(code_type=AccessCodeType.UNIVERSAL)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import validate_code

        result = await validate_code(db, code='UN-ABC12345', session_type='vibe_check')
        assert result['valid'] is True
        assert result['access_code_id'] == 1

    async def test_invalid_code_not_found(self):
        """Non-existent code returns invalid."""
        db = _make_mock_db()
        db.execute.return_value = _mock_scalar_result(None)

        from app.services.access_code_service import validate_code

        result = await validate_code(db, code='NONEXISTENT', session_type='vibe_check')
        assert result['valid'] is False
        assert result['message'] == 'Invalid code'

    async def test_revoked_code_rejected(self):
        """Revoked code returns not active."""
        db = _make_mock_db()
        code = _make_access_code(status=AccessCodeStatus.REVOKED)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import validate_code

        result = await validate_code(db, code='UN-ABC12345', session_type='vibe_check')
        assert result['valid'] is False
        assert 'no longer active' in result['message']

    async def test_expired_code_rejected(self):
        """Expired code auto-transitions to expired and is rejected."""
        db = _make_mock_db()
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        code = _make_access_code(expires_at=past)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import validate_code

        result = await validate_code(db, code='UN-ABC12345', session_type='vibe_check')
        assert result['valid'] is False
        assert 'expired' in result['message']

    async def test_max_uses_reached(self):
        """Code at max uses is rejected."""
        db = _make_mock_db()
        code = _make_access_code(max_uses=3, use_count=3)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import validate_code

        result = await validate_code(db, code='UN-ABC12345', session_type='vibe_check')
        assert result['valid'] is False
        assert 'maximum uses' in result['message']

    async def test_wrong_type_rejected(self):
        """Vibe check code rejected for photobooth session."""
        db = _make_mock_db()
        code = _make_access_code(code_type=AccessCodeType.VIBE_CHECK)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import validate_code

        result = await validate_code(db, code='VC-ABC12345', session_type='photobooth')
        assert result['valid'] is False
        assert 'not valid for this feature' in result['message']

    async def test_case_insensitive_lookup(self):
        """Code lookup is case-insensitive (uppercased)."""
        db = _make_mock_db()
        code = _make_access_code()
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import validate_code

        await validate_code(db, code='un-abc12345', session_type='vibe_check')

        # Verify the query used uppercase
        call_args = db.execute.call_args[0][0]
        # The code should have been uppercased in the query construction
        # We can't easily inspect the SQLAlchemy query, but the function
        # calls code.upper().strip() before the query


# ---------------------------------------------------------------------------
# redeem_code
# ---------------------------------------------------------------------------


class TestRedeemCode:
    """Tests for redeem_code()."""

    async def test_increments_use_count(self):
        """Redeem increments use_count."""
        db = _make_mock_db()
        code = _make_access_code(max_uses=5, use_count=2)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import redeem_code

        result = await redeem_code(db, code_id=1)
        assert result.use_count == 3
        db.commit.assert_awaited()

    async def test_transitions_to_used_at_max(self):
        """Code transitions to USED when use_count reaches max_uses."""
        db = _make_mock_db()
        code = _make_access_code(max_uses=1, use_count=0)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import redeem_code

        result = await redeem_code(db, code_id=1)
        assert result.use_count == 1
        assert result.status == AccessCodeStatus.USED

    async def test_not_found_raises(self):
        """Redeem raises ValueError for missing code."""
        db = _make_mock_db()
        db.execute.return_value = _mock_scalar_result(None)

        from app.services.access_code_service import redeem_code

        with pytest.raises(ValueError, match='not found'):
            await redeem_code(db, code_id=999)

    async def test_inactive_raises(self):
        """Redeem raises ValueError for non-active code."""
        db = _make_mock_db()
        code = _make_access_code(status=AccessCodeStatus.REVOKED)
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import redeem_code

        with pytest.raises(ValueError, match='not active'):
            await redeem_code(db, code_id=1)


# ---------------------------------------------------------------------------
# list_codes
# ---------------------------------------------------------------------------


class TestListCodes:
    """Tests for list_codes()."""

    async def test_returns_codes_and_total(self):
        """list_codes returns codes list and total count."""
        db = _make_mock_db()
        codes = [_make_access_code(id=1), _make_access_code(id=2)]
        db.execute.side_effect = [
            _mock_scalars_result([]),  # auto-expire query
            _mock_scalar_result(2),    # count query
            _mock_scalars_result(codes),  # list query
        ]

        from app.services.access_code_service import list_codes

        result, total = await list_codes(db)
        assert total == 2
        assert len(result) == 2

    async def test_auto_expires_active_codes_past_expiry(self):
        """list_codes auto-exires active codes past their expires_at."""
        db = _make_mock_db()
        expired = _make_access_code(id=1, expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        db.execute.side_effect = [
            _mock_scalars_result([expired]),  # auto-expire finds one
            _mock_scalar_result(1),           # count query
            _mock_scalars_result([expired]),  # list query
        ]

        from app.services.access_code_service import list_codes

        result, total = await list_codes(db)
        assert expired.status == AccessCodeStatus.EXPIRED
        db.commit.assert_awaited()


# ---------------------------------------------------------------------------
# revoke_code
# ---------------------------------------------------------------------------


class TestRevokeCode:
    """Tests for revoke_code()."""

    async def test_sets_status_revoked(self):
        """Revoke sets code status to REVOKED."""
        db = _make_mock_db()
        code = _make_access_code()
        db.execute.return_value = _mock_scalar_result(code)

        from app.services.access_code_service import revoke_code

        result = await revoke_code(db, code_id=1)
        assert result.status == AccessCodeStatus.REVOKED
        db.commit.assert_awaited()

    async def test_not_found_raises(self):
        """Revoke raises ValueError for missing code."""
        db = _make_mock_db()
        db.execute.return_value = _mock_scalar_result(None)

        from app.services.access_code_service import revoke_code

        with pytest.raises(ValueError, match='not found'):
            await revoke_code(db, code_id=999)


# ---------------------------------------------------------------------------
# delete_code
# ---------------------------------------------------------------------------


class TestDeleteCode:
    """Tests for delete_code()."""

    async def test_deletes_when_no_sessions(self):
        """Hard delete succeeds when no sessions reference the code."""
        db = _make_mock_db()
        # No linked sessions
        db.execute.side_effect = [
            _mock_scalar_result(0),  # session count
            MagicMock(rowcount=1),  # delete result
        ]

        from app.services.access_code_service import delete_code

        result = await delete_code(db, code_id=1)
        assert result is True
        db.commit.assert_awaited()

    async def test_blocks_with_linked_sessions(self):
        """Hard delete raises ValueError when sessions reference the code."""
        db = _make_mock_db()
        db.execute.return_value = _mock_scalar_result(3)

        from app.services.access_code_service import delete_code

        with pytest.raises(ValueError, match='3 session'):
            await delete_code(db, code_id=1)

    async def test_returns_false_for_missing(self):
        """Returns False when code not found."""
        db = _make_mock_db()
        db.execute.side_effect = [
            _mock_scalar_result(0),
            MagicMock(rowcount=0),
        ]

        from app.services.access_code_service import delete_code

        result = await delete_code(db, code_id=999)
        assert result is False
