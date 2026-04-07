"""FastAPI dependency injection functions.

Provides async database session, settings singleton, and admin auth check.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, settings
from app.core.database import async_session_maker
from app.core.exceptions import VibePrintError
from app.core.security import decode_access_token

_bearer_scheme = HTTPBearer()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session from the connection pool.

    The session is automatically closed when the request finishes.
    """
    session = async_session_maker()
    try:
        yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


def get_settings() -> Settings:
    """Return the application settings singleton."""
    return settings


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> dict:
    """Decode the JWT bearer token and return the admin payload.

    Raises:
        VibePrintError: If the token is invalid or expired.
    """
    token = credentials.credentials
    payload = decode_access_token(token)
    return payload
