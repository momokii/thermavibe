"""Authentication and security utilities for admin access.

Provides PIN-based authentication with JWT tokens for the operator
admin dashboard. Includes rate limiting for failed login attempts.
"""

from __future__ import annotations

import hmac
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.core.config import settings
from app.core.exceptions import VibePrintError


# --- Rate Limiting ---

_failed_attempts: dict[str, list[float]] = {}
_MAX_FAILED_ATTEMPTS = 5
_RATE_LIMIT_WINDOW_SECONDS = 60


def _is_rate_limited(ip_address: str) -> bool:
    """Check if an IP address has exceeded the failed login attempt limit."""
    now = time.monotonic()
    attempts = _failed_attempts.get(ip_address, [])
    # Remove expired attempts
    attempts = [t for t in attempts if now - t < _RATE_LIMIT_WINDOW_SECONDS]
    _failed_attempts[ip_address] = attempts
    return len(attempts) >= _MAX_FAILED_ATTEMPTS


def _record_failed_attempt(ip_address: str) -> None:
    """Record a failed login attempt for rate limiting."""
    now = time.monotonic()
    if ip_address not in _failed_attempts:
        _failed_attempts[ip_address] = []
    _failed_attempts[ip_address].append(now)


def _clear_failed_attempts(ip_address: str) -> None:
    """Clear failed login attempts after a successful login."""
    _failed_attempts.pop(ip_address, None)


# --- PIN Verification ---

def verify_pin(pin: str, ip_address: str = 'unknown') -> bool:
    """Verify an admin PIN against the configured value.

    Uses constant-time comparison to prevent timing attacks.

    Args:
        pin: The PIN code provided by the user.
        ip_address: Client IP for rate limiting.

    Returns:
        True if the PIN is correct.

    Raises:
        VibePrintError: If rate limited (RATE_LIMITED) or PIN is wrong (AUTH_INVALID_PIN).
    """
    if _is_rate_limited(ip_address):
        raise VibePrintError(
            message='Too many failed login attempts. Please try again later.',
            code='RATE_LIMITED',
        )

    if not hmac.compare_digest(pin, settings.admin_pin):
        _record_failed_attempt(ip_address)
        raise VibePrintError(
            message='Invalid admin PIN',
            code='AUTH_INVALID_PIN',
        )

    _clear_failed_attempts(ip_address)
    return True


# --- JWT Token Management ---

def create_access_token(
    subject: str = 'admin',
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Create a signed JWT access token.

    Args:
        subject: Token subject (typically 'admin').
        expires_delta: Custom expiry duration. Defaults to 24 hours.
        extra_claims: Additional claims to include in the token payload.

    Returns:
        Encoded JWT token string.
    """
    if expires_delta is None:
        expires_delta = timedelta(hours=settings.admin_session_ttl_hours)

    now = datetime.now(timezone.utc)
    expire = now + expires_delta

    payload: dict[str, Any] = {
        'sub': subject,
        'iat': now,
        'exp': expire,
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.app_secret_key, algorithm='HS256')


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token.

    Args:
        token: The encoded JWT token string.

    Returns:
        Decoded token payload as a dictionary.

    Raises:
        VibePrintError: If the token is expired (AUTH_TOKEN_EXPIRED)
            or invalid (AUTH_TOKEN_INVALID).
    """
    try:
        payload = jwt.decode(
            token,
            settings.app_secret_key,
            algorithms=['HS256'],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise VibePrintError(
            message='Authentication token has expired',
            code='AUTH_TOKEN_EXPIRED',
        )
    except jwt.InvalidTokenError:
        raise VibePrintError(
            message='Invalid authentication token',
            code='AUTH_TOKEN_INVALID',
        )


def get_token_expiry(timestamp: datetime | None = None) -> datetime:
    """Calculate token expiry timestamp.

    Args:
        timestamp: Base timestamp. Defaults to now.

    Returns:
        Expiry datetime (24 hours from the given timestamp).
    """
    base = timestamp or datetime.now(timezone.utc)
    return base + timedelta(hours=settings.admin_session_ttl_hours)
