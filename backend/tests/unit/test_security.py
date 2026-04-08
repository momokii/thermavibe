"""Unit tests for app.core.security — PIN verification, JWT token management."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core.exceptions import VibePrintError
from app.core.security import (
    _clear_failed_attempts,
    _is_rate_limited,
    _record_failed_attempt,
    create_access_token,
    decode_access_token,
    get_token_expiry,
    verify_pin,
)


# ---------------------------------------------------------------------------
# verify_pin — success
# ---------------------------------------------------------------------------

class TestVerifyPinSuccess:
    """Tests for successful PIN verification."""

    def test_correct_pin_returns_true(self) -> None:
        result = verify_pin(pin=settings.admin_pin, ip_address='127.0.0.1')
        assert result is True

    def test_correct_pin_clears_failed_attempts(self) -> None:
        """After 3 wrong attempts, a correct PIN should reset the counter."""
        ip = '10.0.0.1'
        for _ in range(3):
            with pytest.raises(VibePrintError, match='Invalid admin PIN'):
                verify_pin(pin='0000', ip_address=ip)

        # The IP should still have failed attempts recorded
        assert not _is_rate_limited(ip)

        # Correct PIN should clear them
        result = verify_pin(pin=settings.admin_pin, ip_address=ip)
        assert result is True
        assert not _is_rate_limited(ip)


# ---------------------------------------------------------------------------
# verify_pin — wrong PIN
# ---------------------------------------------------------------------------

class TestVerifyPinWrongPin:
    """Tests for incorrect PIN handling."""

    def test_wrong_pin_raises_auth_invalid_pin(self) -> None:
        with pytest.raises(VibePrintError) as exc_info:
            verify_pin(pin='0000', ip_address='1.2.3.4')
        assert exc_info.value.code == 'AUTH_INVALID_PIN'
        assert 'Invalid admin PIN' in exc_info.value.message

    def test_wrong_pin_records_failed_attempt(self) -> None:
        ip = '5.6.7.8'
        with pytest.raises(VibePrintError):
            verify_pin(pin='0000', ip_address=ip)
        # One failed attempt should not trigger rate limiting
        assert not _is_rate_limited(ip)


# ---------------------------------------------------------------------------
# verify_pin — rate limiting
# ---------------------------------------------------------------------------

class TestVerifyPinRateLimiting:
    """Tests for rate limiting after failed attempts."""

    def test_rate_limited_after_5_failed_attempts(self) -> None:
        ip = '192.168.1.1'
        # 5 failed attempts triggers the rate limit
        for _ in range(5):
            with pytest.raises(VibePrintError, match='Invalid admin PIN'):
                verify_pin(pin='0000', ip_address=ip)

        # The 6th attempt (even if correct) should be rate-limited
        with pytest.raises(VibePrintError) as exc_info:
            verify_pin(pin=settings.admin_pin, ip_address=ip)
        assert exc_info.value.code == 'RATE_LIMITED'
        assert 'Too many failed' in exc_info.value.message

    def test_different_ips_have_independent_counters(self) -> None:
        """Rate limiting is per-IP, not global."""
        ip_a = '10.0.0.2'
        ip_b = '10.0.0.3'

        # Burn through 5 attempts on IP A
        for _ in range(5):
            with pytest.raises(VibePrintError):
                verify_pin(pin='0000', ip_address=ip_a)

        # IP A should be rate-limited
        with pytest.raises(VibePrintError, match='Too many failed'):
            verify_pin(pin=settings.admin_pin, ip_address=ip_a)

        # IP B should still work fine
        result = verify_pin(pin=settings.admin_pin, ip_address=ip_b)
        assert result is True


# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------

class TestCreateAccessToken:
    """Tests for JWT access token creation."""

    def test_creates_valid_jwt(self) -> None:
        token = create_access_token()
        assert isinstance(token, str)
        assert len(token) > 0

        # Should be decodable
        payload = decode_access_token(token)
        assert payload['sub'] == 'admin'
        assert 'exp' in payload
        assert 'iat' in payload

    def test_custom_expiry(self) -> None:
        short_delta = timedelta(minutes=5)
        token = create_access_token(expires_delta=short_delta)
        payload = decode_access_token(token)

        # Expiry should be ~5 minutes from now, not 24 hours
        exp = datetime.fromtimestamp(payload['exp'], tz=timezone.utc)
        iat = datetime.fromtimestamp(payload['iat'], tz=timezone.utc)
        actual_delta = exp - iat
        assert actual_delta.total_seconds() == pytest.approx(300, abs=2)

    def test_extra_claims(self) -> None:
        token = create_access_token(
            subject='operator',
            extra_claims={'role': 'admin', 'kiosk_id': 'k1'},
        )
        payload = decode_access_token(token)
        assert payload['sub'] == 'operator'
        assert payload['role'] == 'admin'
        assert payload['kiosk_id'] == 'k1'

    def test_custom_subject(self) -> None:
        token = create_access_token(subject='superuser')
        payload = decode_access_token(token)
        assert payload['sub'] == 'superuser'


# ---------------------------------------------------------------------------
# decode_access_token
# ---------------------------------------------------------------------------

class TestDecodeAccessToken:
    """Tests for JWT access token decoding and validation."""

    def test_valid_token_returns_payload(self) -> None:
        token = create_access_token()
        payload = decode_access_token(token)
        assert payload['sub'] == 'admin'
        assert 'exp' in payload
        assert 'iat' in payload

    def test_expired_token_raises_auth_token_expired(self) -> None:
        # Create a token that has already expired
        past_delta = timedelta(seconds=-10)
        token = create_access_token(expires_delta=past_delta)

        with pytest.raises(VibePrintError) as exc_info:
            decode_access_token(token)
        assert exc_info.value.code == 'AUTH_TOKEN_EXPIRED'
        assert 'expired' in exc_info.value.message.lower()

    def test_invalid_token_raises_auth_token_invalid(self) -> None:
        with pytest.raises(VibePrintError) as exc_info:
            decode_access_token('this.is.not.a.valid.jwt')
        assert exc_info.value.code == 'AUTH_TOKEN_INVALID'
        assert 'Invalid authentication token' in exc_info.value.message

    def test_tampered_token_raises_auth_token_invalid(self) -> None:
        """Modifying the payload of a valid token should make it invalid."""
        token = create_access_token()
        # Tamper with the middle part of the JWT
        parts = token.split('.')
        parts[1] = 'a' * len(parts[1])
        tampered = '.'.join(parts)

        with pytest.raises(VibePrintError) as exc_info:
            decode_access_token(tampered)
        assert exc_info.value.code == 'AUTH_TOKEN_INVALID'

    def test_empty_token_raises_auth_token_invalid(self) -> None:
        with pytest.raises(VibePrintError) as exc_info:
            decode_access_token('')
        assert exc_info.value.code == 'AUTH_TOKEN_INVALID'


# ---------------------------------------------------------------------------
# get_token_expiry
# ---------------------------------------------------------------------------

class TestGetTokenExpiry:
    """Tests for the get_token_expiry helper."""

    def test_returns_datetime_24h_from_now(self) -> None:
        now = datetime.now(timezone.utc)
        expiry = get_token_expiry()
        delta = expiry - now
        assert delta.total_seconds() == pytest.approx(86400, abs=2)

    def test_custom_timestamp(self) -> None:
        base = datetime(2025, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        expiry = get_token_expiry(timestamp=base)
        expected = datetime(2025, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
        assert expiry == expected

    def test_returns_aware_datetime(self) -> None:
        expiry = get_token_expiry()
        assert expiry.tzinfo is not None
        assert expiry.tzinfo == timezone.utc


# ---------------------------------------------------------------------------
# Internal rate-limit helpers
# ---------------------------------------------------------------------------

class TestRateLimitHelpers:
    """Tests for internal rate-limit bookkeeping functions."""

    def test_is_rate_limited_returns_false_for_unknown_ip(self) -> None:
        assert _is_rate_limited('255.255.255.255') is False

    def test_record_failed_attempt(self) -> None:
        ip = '172.16.0.1'
        _record_failed_attempt(ip)
        assert ip in _failed_attempts_map()
        assert len(_failed_attempts_map()[ip]) == 1

    def test_clear_failed_attempts(self) -> None:
        ip = '172.16.0.2'
        _record_failed_attempt(ip)
        _clear_failed_attempts(ip)
        assert ip not in _failed_attempts_map()

    def test_is_rate_limited_after_max_attempts(self) -> None:
        ip = '172.16.0.3'
        for _ in range(5):
            _record_failed_attempt(ip)
        assert _is_rate_limited(ip) is True


def _failed_attempts_map() -> dict:
    """Accessor for the private _failed_attempts dict in security module."""
    import app.core.security as security_mod
    return security_mod._failed_attempts
