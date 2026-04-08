"""Pytest fixtures for backend testing.

Provides SQLite in-memory database, async HTTP test client,
authentication helpers, and mock utilities for all test modules.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import JSON, Index
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ---------------------------------------------------------------------------
# Ensure all model classes are registered with Base.metadata
# ---------------------------------------------------------------------------
from app.core.database import Base
from app.models.analytics import AnalyticsEvent, PrintJob  # noqa: F401
from app.models.configuration import OperatorConfig  # noqa: F401
from app.models.device import Device  # noqa: F401
from app.models.session import KioskSession  # noqa: F401


# ---------------------------------------------------------------------------
# SQLite-compatible metadata preparation
# ---------------------------------------------------------------------------

def _prepare_metadata_for_sqlite() -> None:
    """Patch Base.metadata so all tables work with SQLite.

    1. Replace postgresql.JSONB columns with sqlalchemy.JSON.
    2. Strip postgresql_where kwargs from indexes.
    3. Strip postgresql-specific server_default expressions (e.g. gen_random_uuid).
    """
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            # Replace JSONB with plain JSON for SQLite
            col_type_class = type(column.type).__name__
            if col_type_class == 'JSONB':
                column.type = JSON()

            # Replace gen_random_uuid() server_default with a Python-side default
            # SQLite does not understand gen_random_uuid()
            sd = column.server_default
            if sd is not None:
                sd_text = getattr(sd, 'arg', None)
                if sd_text is not None and 'gen_random_uuid' in str(sd_text):
                    column.server_default = None

        # Clean postgresql_where from __table_args__
        table_args = getattr(table, '__table_args__', None)
        if not table_args:
            continue

        if isinstance(table_args, dict):
            table.__table_args__ = {
                k: v for k, v in table_args.items() if k != 'postgresql_where'
            }
        elif isinstance(table_args, (list, tuple)):
            new_args = []
            for arg in table_args:
                if isinstance(arg, dict):
                    cleaned = {k: v for k, v in arg.items() if k != 'postgresql_where'}
                    new_args.append(cleaned)
                else:
                    new_args.append(arg)
            table.__table_args__ = tuple(new_args)


# Run the patching once at import time
_prepare_metadata_for_sqlite()


# ---------------------------------------------------------------------------
# Database fixtures
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = 'sqlite+aiosqlite:///:memory:'


@pytest.fixture
async def db_engine():
    """Create a test SQLite async engine.

    Tables are created before the test and dropped afterward.
    """
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional async database session.

    Each test gets a fresh session; the database is cleaned via
    create_all / drop_all in the engine fixture.
    """
    session_factory = async_sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest.fixture
def mock_db_session() -> AsyncMock:
    """Return an AsyncMock that quacks like an AsyncSession.

    Useful for pure unit tests that do not need a real database.
    """
    session = AsyncMock(spec=AsyncSession)
    return session


# ---------------------------------------------------------------------------
# HTTP test client
# ---------------------------------------------------------------------------

@pytest.fixture
async def client(db_engine) -> AsyncGenerator[AsyncClient, None]:
    """Provide an httpx AsyncClient wired to the FastAPI app.

    Overrides the get_db_session dependency with a test session
    backed by the in-memory SQLite database.
    """
    from app.api.deps import get_db_session
    from app.main import app

    session_factory = async_sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async def override_get_db_session() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db_session] = override_get_db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://testserver') as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Authentication fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_token() -> str:
    """Create a valid JWT admin access token."""
    from app.core.security import create_access_token
    return create_access_token()


@pytest.fixture
def auth_headers(admin_token: str) -> dict[str, str]:
    """Return Authorization headers for admin API requests."""
    return {'Authorization': f'Bearer {admin_token}'}


# ---------------------------------------------------------------------------
# Reset / cleanup fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear the security rate limiter before and after each test.

    Prevents state leaking between tests that call verify_pin.
    """
    import app.core.security as security_mod
    security_mod._failed_attempts.clear()
    yield
    security_mod._failed_attempts.clear()


@pytest.fixture
def reset_payment_store():
    """Clear the payment in-memory store before and after each test."""
    import app.services.payment_service as payment_mod
    payment_mod._payment_store.clear()
    yield
    payment_mod._payment_store.clear()


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_image_bytes() -> bytes:
    """Return minimal valid JPEG bytes (1x1 white pixel).

    This is a real JPEG file that can be opened by Pillow.
    """
    # Minimal JPEG: SOI + APP0 + DQT + SOF0 + DHT + SOS + data + EOI
    # Using a well-known minimal 1x1 white JPEG
    return (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
        b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f'
        b'\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342'
        b'\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00'
        b'\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00'
        b'\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b'
        b'\xff\xc4\x00\xb5\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04'
        b'\x04\x00\x00\x01}\x01\x02\x03\x00\x04\x11\x05\x12!1A\x06\x13Qa'
        b'\x07"q\x142\x81\x91\xa1\x08#B\xb1\xc1\x15R\xd1\xf0$3br\x82\t\n'
        b'\x16\x17\x18\x19\x1a%&\'()*456789:CDEFGHIJSTUVWXYZcdefghijstuvwxyz'
        b'\x83\x84\x85\x86\x87\x88\x89\x8a\x92\x93\x94\x95\x96\x97\x98\x99'
        b'\x9a\xa2\xa3\xa4\xa5\xa6\xa7\xa8\xa9\xaa\xb2\xb3\xb4\xb5\xb6\xb7'
        b'\xb8\xb9\xba\xc2\xc3\xc4\xc5\xc6\xc7\xc8\xc9\xca\xd2\xd3\xd4\xd5'
        b'\xd6\xd7\xd8\xd9\xda\xe1\xe2\xe3\xe4\xe5\xe6\xe7\xe8\xe9\xea\xf1'
        b'\xf2\xf3\xf4\xf5\xf6\xf7\xf8\xf9\xfa'
        b'\xff\xda\x00\x08\x01\x01\x00\x00?'
        b'\x00\xfb\xd2\x82\xca\x4b'
        b'\xff\xd9'
    )


@pytest.fixture
def sample_session_id() -> uuid.UUID:
    """Return a deterministic UUID for test session identification."""
    return uuid.UUID('12345678-1234-5678-1234-567812345678')
