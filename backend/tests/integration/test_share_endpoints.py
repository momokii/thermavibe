"""Integration tests for the public digital-sharing endpoints.

Covers Gap 1 (URL plumbing), Gap 2 (HTML landing page + image split),
and Gap 3 (analytics events). Uses the real SQLite-backed test client so
the full request stack — token validation, HTML render, analytics write —
is exercised end-to-end.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.analytics import AnalyticsEvent
from app.models.configuration import ConfigCategory, OperatorConfig
from app.models.session import KioskSession, KioskState, SessionType

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def composite_file(tmp_path: Path) -> Path:
    """Write a fake composite JPEG to tmp_path and return its location."""
    p = tmp_path / 'strip.jpg'
    p.write_bytes(b'\xff\xd8\xff\xe0' + b'\x00' * 100 + b'\xff\xd9')
    return p


@pytest.fixture
async def sharing_config(db_session: AsyncSession):
    """Seed the SHARING OperatorConfig category so the share endpoint has branding."""
    db_session.add_all([
        OperatorConfig(
            key='share_brand_name',
            value='TestCafe',
            category=ConfigCategory.SHARING.value,
            description='',
        ),
        OperatorConfig(
            key='share_brand_handle',
            value='@testcafe',
            category=ConfigCategory.SHARING.value,
            description='',
        ),
        OperatorConfig(
            key='share_brand_color',
            value='#123456',
            category=ConfigCategory.SHARING.value,
            description='',
        ),
    ])
    await db_session.commit()


async def _seed_photobooth_session(db_session: AsyncSession, composite_path: Path) -> KioskSession:
    """Insert a KioskSession in PHOTOBOOTH_REVEAL with a composite on disk."""
    session = KioskSession(
        state=KioskState.PHOTOBOOTH_REVEAL,
        session_type=SessionType.PHOTOBOOTH,
        composite_image_path=str(composite_path),
    )
    db_session.add(session)
    await db_session.commit()
    await db_session.refresh(session)
    return session


async def _fetch_events(db_engine, event_type: str) -> list[AnalyticsEvent]:
    """Read analytics rows on a fresh session (avoids identity-map staleness)."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        result = await s.execute(
            select(AnalyticsEvent).where(AnalyticsEvent.event_type == event_type)
        )
        return list(result.scalars().all())


def _extract_token(share_url: str) -> str:
    """Pull the token portion out of a share URL (relative or absolute)."""
    return share_url.rsplit('/', 1)[-1]


# ---------------------------------------------------------------------------
# Gap 1: URL plumbing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_share_url_is_relative_by_default(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """Without PUBLIC_BASE_URL, qr_data starts with /api/v1/kiosk/share/."""
    from app.api.v1.endpoints import kiosk as kiosk_module
    from app.core.config import settings

    # Force unset regardless of what's in the operator's .env — this test
    # must be deterministic.
    saved = settings.public_base_url
    settings.public_base_url = None
    with patch.object(kiosk_module, 'get_settings') as mock_dep:
        mock_dep.return_value = settings
        session = await _seed_photobooth_session(db_session, composite_file)
        resp = await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')
    settings.public_base_url = saved

    data = resp.json()
    assert data['share_url'].startswith('/api/v1/kiosk/share/')
    assert data['qr_data'] == data['share_url']
    assert data['expires_in'] > 0


@pytest.mark.asyncio
async def test_share_url_is_absolute_when_public_base_url_set(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """With PUBLIC_BASE_URL, qr_data is an absolute URL prefixed with the host."""
    from app.api.v1.endpoints import kiosk as kiosk_module
    from app.core.config import settings

    public = 'https://kiosk.example.com'
    with patch.object(kiosk_module, 'get_settings') as mock_dep:
        settings.public_base_url = public
        mock_dep.return_value = settings
        session = await _seed_photobooth_session(db_session, composite_file)
        resp = await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')
    settings.public_base_url = None  # reset for subsequent tests

    data = resp.json()
    assert data['share_url'].startswith(f'{public}/api/v1/kiosk/share/')
    assert data['qr_data'] == data['share_url']


@pytest.mark.asyncio
async def test_share_url_strips_trailing_slash_in_public_base_url(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """Trailing slash on PUBLIC_BASE_URL must not produce // in the URL."""
    from app.api.v1.endpoints import kiosk as kiosk_module
    from app.core.config import settings

    with patch.object(kiosk_module, 'get_settings') as mock_dep:
        settings.public_base_url = 'https://kiosk.example.com/'
        mock_dep.return_value = settings
        session = await _seed_photobooth_session(db_session, composite_file)
        resp = await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')
    settings.public_base_url = None

    data = resp.json()
    assert 'https://kiosk.example.com//api' not in data['share_url']
    assert data['share_url'].startswith('https://kiosk.example.com/api')


# ---------------------------------------------------------------------------
# Gap 2: Landing page + image sub-path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_landing_page_returns_html(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path, db_engine
):
    """GET /share/{token} returns text/html with the download link."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    resp = await client.get(f'/api/v1/kiosk/share/{token}')
    assert resp.status_code == 200
    assert 'text/html' in resp.headers['content-type']
    assert 'Download' in resp.text
    assert f'/api/v1/kiosk/share/{token}/image' in resp.text
    assert '<meta name="viewport"' in resp.text


@pytest.mark.asyncio
async def test_image_endpoint_returns_jpeg(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """GET /share/{token}/image returns the raw JPEG bytes."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    resp = await client.get(f'/api/v1/kiosk/share/{token}/image')
    assert resp.status_code == 200
    assert resp.headers['content-type'] == 'image/jpeg'
    assert resp.content.startswith(b'\xff\xd8')  # JPEG SOI


@pytest.mark.asyncio
async def test_expired_token_returns_410_html(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """An expired token returns a friendly 410 HTML page (not a JSON error)."""
    from app.api.v1.endpoints import kiosk as kiosk_module
    from app.core.config import settings

    with patch.object(kiosk_module, 'get_settings') as mock_dep:
        settings.photobooth_share_url_ttl_seconds = -1  # already expired at creation
        mock_dep.return_value = settings
        session = await _seed_photobooth_session(db_session, composite_file)
        share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    settings.photobooth_share_url_ttl_seconds = 300

    token = _extract_token(share['qr_data'])
    resp = await client.get(f'/api/v1/kiosk/share/{token}')
    assert resp.status_code == 410
    assert 'text/html' in resp.headers['content-type']
    assert 'expired' in resp.text.lower()


@pytest.mark.asyncio
async def test_tampered_token_returns_410(
    client: AsyncClient
):
    """A malformed token returns 410 HTML, not a stack trace."""
    resp = await client.get('/api/v1/kiosk/share/not-a-real-token')
    assert resp.status_code == 410
    assert 'text/html' in resp.headers['content-type']


@pytest.mark.asyncio
async def test_landing_page_uses_db_sourced_branding(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path, sharing_config
):
    """Branding fields from the SHARING OperatorConfig category appear in the HTML."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    resp = await client.get(f'/api/v1/kiosk/share/{token}')
    assert resp.status_code == 200
    assert 'TestCafe' in resp.text
    assert '@testcafe' in resp.text
    assert '#123456' in resp.text


# ---------------------------------------------------------------------------
# Gap 3: Analytics events
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_share_scan_analytics_event_written(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path, db_engine
):
    """Hitting the landing page writes a SHARE_URL_SCANNED row."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    await client.get(f'/api/v1/kiosk/share/{token}')

    events = await _fetch_events(db_engine, 'share_url_scanned')
    assert len(events) >= 1
    assert events[0].session_id == session.id


@pytest.mark.asyncio
async def test_composite_downloaded_analytics_event_written(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path, db_engine
):
    """Hitting the image endpoint writes a COMPOSITE_DOWNLOADED row."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    await client.get(f'/api/v1/kiosk/share/{token}/image')

    events = await _fetch_events(db_engine, 'composite_downloaded')
    assert len(events) >= 1


@pytest.mark.asyncio
async def test_analytics_failure_does_not_break_landing_page(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """If analytics write raises, the landing page still returns 200 HTML."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    with patch('app.services.analytics_service.record_event', side_effect=RuntimeError('boom')):
        resp = await client.get(f'/api/v1/kiosk/share/{token}')

    assert resp.status_code == 200
    assert 'text/html' in resp.headers['content-type']


@pytest.mark.asyncio
async def test_analytics_failure_does_not_break_image_endpoint(
    client: AsyncClient, db_session: AsyncSession, composite_file: Path
):
    """If analytics write raises, the image endpoint still serves the JPEG."""
    session = await _seed_photobooth_session(db_session, composite_file)
    share = (await client.get(f'/api/v1/kiosk/session/{session.id}/photobooth/share')).json()
    token = _extract_token(share['qr_data'])

    with patch('app.services.analytics_service.record_event', side_effect=RuntimeError('boom')):
        resp = await client.get(f'/api/v1/kiosk/share/{token}/image')

    assert resp.status_code == 200
    assert resp.headers['content-type'] == 'image/jpeg'
