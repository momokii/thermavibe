"""Temporary share URL service for photobooth composites.

Generates HMAC-signed stateless tokens for sharing composite images.
No database table needed — tokens are validated via HMAC signature + expiry.
"""

from __future__ import annotations

import hashlib
import hmac
import structlog
from datetime import datetime, timezone

from app.core.config import settings
from app.core.exceptions import VibePrintError

logger = structlog.get_logger(__name__)


def generate_share_token(
    session_id: str,
    ttl_seconds: int = 300,
) -> tuple[str, datetime]:
    """Generate a temporary share token for a photobooth composite.

    The token encodes session_id + expiry timestamp and is signed with HMAC.

    Args:
        session_id: The session UUID as string.
        ttl_seconds: Time-to-live in seconds (default 300 = 5 minutes).

    Returns:
        Tuple of (token_string, expires_at_datetime).
    """
    expires_at = datetime.now(timezone.utc).timestamp() + ttl_seconds
    expires_str = str(int(expires_at))

    # Build message: session_id:expiry_timestamp
    message = f'{session_id}:{expires_str}'

    # Sign with HMAC-SHA256
    signature = hmac.new(
        settings.app_secret_key.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()

    # Token format: session_id:expiry:signature
    token = f'{session_id}:{expires_str}:{signature}'

    expires_datetime = datetime.fromtimestamp(expires_at, tz=timezone.utc)

    logger.info(
        'share_token_generated',
        session_id=session_id,
        ttl_seconds=ttl_seconds,
    )

    return token, expires_datetime


def validate_share_token(token: str) -> str:
    """Validate a share token and return the session_id.

    Args:
        token: The share token string.

    Returns:
        The session UUID as string.

    Raises:
        VibePrintError: If the token is invalid, expired, or tampered.
    """
    parts = token.split(':')

    # Expected format: session_uuid:expiry_timestamp:signature
    # UUID has hyphens, so we need at least 6 parts (uuid = 5 hyphens + 1 colon split = 5 parts,
    # then expiry = 1 part, signature = 1 part = 7 parts)
    # Actually UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (4 hyphens)
    # Split by ':' gives: [uuid_part1, uuid_part2, ..., expiry, signature]
    # Simpler: find the last two colons
    try:
        last_colon = token.rfind(':')
        second_last_colon = token.rfind(':', 0, last_colon)
        if last_colon == -1 or second_last_colon == -1:
            raise VibePrintError('Invalid share token format', code='SHARE_INVALID')

        signature = token[last_colon + 1:]
        expiry_str = token[second_last_colon + 1:last_colon]
        session_id = token[:second_last_colon]
    except (ValueError, IndexError):
        raise VibePrintError('Invalid share token format', code='SHARE_INVALID')

    # Check expiry
    try:
        expires_at = float(expiry_str)
    except ValueError:
        raise VibePrintError('Invalid share token format', code='SHARE_INVALID')

    now = datetime.now(timezone.utc).timestamp()
    if now > expires_at:
        raise VibePrintError(
            'Share link has expired',
            code='SHARE_EXPIRED',
        )

    # Verify HMAC signature
    message = f'{session_id}:{expiry_str}'
    expected_signature = hmac.new(
        settings.app_secret_key.encode(),
        message.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        raise VibePrintError('Invalid share token', code='SHARE_INVALID')

    return session_id
