"""Integration tests for admin dashboard flow.

Tests exercise admin authentication, config CRUD, analytics, and hardware
status endpoints via httpx AsyncClient with ASGITransport. Services are
mocked at the endpoint module level so no real database or hardware is
required.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.admin import (
    ConfigAllResponse,
    ConfigUpdateResponse,
    HardwareStatusResponse,
    LoginResponse,
    RevenueAnalyticsResponse,
    SessionAnalyticsResponse,
)
from app.schemas.print import PrintStatusResponse, PrintTestResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_login_response() -> dict:
    """Build a mock login response matching the LoginResponse schema."""
    now = datetime.now(timezone.utc)
    return {
        'token': 'fake-jwt-token-for-testing',
        'token_type': 'Bearer',
        'expires_in': 86400,
        'expires_at': now.isoformat(),
    }


def _mock_hardware_status() -> dict:
    """Build a minimal hardware status response dict."""
    from app.schemas.admin import (
        ActiveCameraStatus,
        CameraStatusDetail,
        PrinterHardwareStatus,
        PrinterStatusDetail,
        SystemResources,
    )

    status = HardwareStatusResponse(
        camera=ActiveCameraStatus(
            connected=True,
            active_device=None,
            status=CameraStatusDetail(streaming=False, errors=[]),
        ),
        printer=PrinterHardwareStatus(
            connected=False,
            device=None,
            status=PrinterStatusDetail(
                paper_ok=False,
                printer_online=False,
                errors=['Printer not connected'],
            ),
        ),
        system=SystemResources(
            cpu_usage_percent=12.5,
            memory_usage_mb=256.0,
            disk_usage_percent=45.2,
            uptime_seconds=3600.0,
        ),
    )
    return status.model_dump()


# ---------------------------------------------------------------------------
# Authentication tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_with_correct_pin_returns_200(client: AsyncClient):
    """POST /api/v1/admin/login with correct PIN returns JWT token."""
    # The default admin_pin in test settings is '1234'
    with patch('app.api.v1.endpoints.admin.create_access_token', return_value='fake-jwt-token'):
        resp = await client.post('/api/v1/admin/login', json={'pin': '1234'})

    assert resp.status_code == 200
    data = resp.json()
    assert data['token'] == 'fake-jwt-token'
    assert data['token_type'] == 'Bearer'
    assert data['expires_in'] == 86400
    assert 'expires_at' in data


@pytest.mark.asyncio
async def test_login_with_wrong_pin_returns_401(client: AsyncClient):
    """POST /api/v1/admin/login with wrong PIN returns 401."""
    resp = await client.post('/api/v1/admin/login', json={'pin': '0000'})

    assert resp.status_code == 401
    data = resp.json()
    assert 'error' in data
    assert data['error']['code'] == 'AUTH_INVALID_PIN'


@pytest.mark.asyncio
async def test_login_with_short_pin_returns_422(client: AsyncClient):
    """POST /api/v1/admin/login with too-short PIN returns 422 validation error."""
    resp = await client.post('/api/v1/admin/login', json={'pin': '12'})

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Config tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_config_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """GET /api/v1/admin/config with valid auth returns config categories."""
    mock_categories = {
        'general': {'app_env': 'development', 'admin_pin': '1234'},
        'ai': {'ai_provider': 'openai', 'ai_model': 'gpt-4o'},
    }

    with patch('app.api.v1.endpoints.admin.config_service') as cfg_svc:
        cfg_svc.get_all_configs = AsyncMock(return_value=mock_categories)

        resp = await client.get('/api/v1/admin/config', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert 'categories' in data
    assert 'general' in data['categories']
    assert data['categories']['general']['app_env'] == 'development'


@pytest.mark.asyncio
async def test_get_config_without_auth_returns_401_or_403(client: AsyncClient):
    """GET /api/v1/admin/config without auth returns 401 or 403."""
    resp = await client.get('/api/v1/admin/config')

    # FastAPI HTTPBearer raises 403 when no credentials are provided
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_update_config_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """PUT /api/v1/admin/config/{category} with auth updates config."""
    mock_updated = {'ai_provider': 'anthropic', 'ai_model': 'claude-sonnet-4-20250514'}
    mock_all = {'ai_provider': 'anthropic', 'ai_model': 'claude-sonnet-4-20250514', 'ai_system_prompt': 'You are a vibe reader.'}

    with patch('app.api.v1.endpoints.admin.config_service') as cfg_svc:
        cfg_svc.update_config = AsyncMock(return_value=mock_updated)
        cfg_svc.get_configs_by_category = AsyncMock(return_value=mock_all)

        resp = await client.put(
            '/api/v1/admin/config/ai',
            headers=auth_headers,
            json={'ai_provider': 'anthropic', 'ai_model': 'claude-sonnet-4-20250514'},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['category'] == 'ai'
    assert 'updated_fields' in data
    assert 'all_values' in data
    assert data['all_values']['ai_provider'] == 'anthropic'


@pytest.mark.asyncio
async def test_update_config_without_auth_returns_401_or_403(client: AsyncClient):
    """PUT /api/v1/admin/config/{category} without auth returns 401 or 403."""
    resp = await client.put(
        '/api/v1/admin/config/ai',
        json={'ai_provider': 'anthropic'},
    )

    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Analytics tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_session_analytics_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """GET /api/v1/admin/analytics/sessions with auth returns session analytics."""
    mock_response = SessionAnalyticsResponse(
        summary={
            'total_sessions': 100,
            'completed_sessions': 85,
            'abandoned_sessions': 15,
            'completion_rate': 85.0,
            'avg_duration_seconds': 45.2,
        },
        state_distribution={'idle': 5, 'processing': 3, 'reveal': 7},
        timeseries=[],
        page=1,
        per_page=0,
        total_periods=0,
    )

    with patch('app.api.v1.endpoints.admin.analytics_service') as analytics_svc:
        analytics_svc.get_session_analytics = AsyncMock(return_value=mock_response)

        resp = await client.get('/api/v1/admin/analytics/sessions', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert 'summary' in data
    assert data['summary']['total_sessions'] == 100
    assert data['summary']['completion_rate'] == 85.0
    assert 'state_distribution' in data
    assert 'timeseries' in data


@pytest.mark.asyncio
async def test_revenue_analytics_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """GET /api/v1/admin/analytics/revenue with auth returns revenue analytics."""
    mock_response = RevenueAnalyticsResponse(
        summary={
            'total_revenue': 425000,
            'total_transactions': 85,
            'avg_transaction_amount': 5000,
            'currency': 'IDR',
            'refund_count': 2,
            'refund_total': 10000,
        },
        timeseries=[],
        by_provider={'mock': {'transactions': 85, 'revenue': 425000, 'success_rate': 100.0}},
    )

    with patch('app.api.v1.endpoints.admin.analytics_service') as analytics_svc:
        analytics_svc.get_revenue_analytics = AsyncMock(return_value=mock_response)

        resp = await client.get('/api/v1/admin/analytics/revenue', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert 'summary' in data
    assert data['summary']['total_revenue'] == 425000
    assert data['summary']['total_transactions'] == 85
    assert 'timeseries' in data
    assert 'by_provider' in data


@pytest.mark.asyncio
async def test_session_analytics_without_auth_returns_401_or_403(client: AsyncClient):
    """GET /api/v1/admin/analytics/sessions without auth returns 401 or 403."""
    resp = await client.get('/api/v1/admin/analytics/sessions')

    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_revenue_analytics_without_auth_returns_401_or_403(client: AsyncClient):
    """GET /api/v1/admin/analytics/revenue without auth returns 401 or 403."""
    resp = await client.get('/api/v1/admin/analytics/revenue')

    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Hardware status tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hardware_status_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """GET /api/v1/admin/hardware/status with auth returns hardware status."""
    mock_status_dict = _mock_hardware_status()

    with patch('app.api.v1.endpoints.admin.get_full_hardware_status', return_value=mock_status_dict):
        resp = await client.get('/api/v1/admin/hardware/status', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert 'camera' in data
    assert 'printer' in data
    assert 'system' in data
    assert 'cpu_usage_percent' in data['system']
    assert 'uptime_seconds' in data['system']


@pytest.mark.asyncio
async def test_hardware_status_without_auth_returns_401_or_403(client: AsyncClient):
    """GET /api/v1/admin/hardware/status without auth returns 401 or 403."""
    resp = await client.get('/api/v1/admin/hardware/status')

    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_test_camera_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """POST /api/v1/admin/hardware/camera/test with auth returns test result."""
    mock_result = {
        'success': True,
        'message': 'Camera capture successful (102400 bytes)',
        'size_bytes': 102400,
    }

    with patch('app.api.v1.endpoints.admin.test_camera_capture', return_value=mock_result):
        resp = await client.post('/api/v1/admin/hardware/camera/test', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
    assert 'message' in data
    assert data['size_bytes'] == 102400


@pytest.mark.asyncio
async def test_test_camera_failure(client: AsyncClient, auth_headers: dict[str, str]):
    """POST /api/v1/admin/hardware/camera/test returns failure when camera unavailable."""
    mock_result = {
        'success': False,
        'message': 'Camera test failed: Cannot open camera device 0',
        'size_bytes': 0,
    }

    with patch('app.api.v1.endpoints.admin.test_camera_capture', return_value=mock_result):
        resp = await client.post('/api/v1/admin/hardware/camera/test', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is False


@pytest.mark.asyncio
async def test_test_printer_admin_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """POST /api/v1/admin/hardware/printer/test with auth returns test result."""
    mock_result = PrintTestResponse(
        success=True,
        message='Test print sent successfully',
        printer_info=None,
    )

    # print_test_page is imported locally in the endpoint, patch at source module
    with patch('app.services.printer_service.print_test_page', return_value=mock_result):
        resp = await client.post('/api/v1/admin/hardware/printer/test', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True
    assert 'message' in data


@pytest.mark.asyncio
async def test_test_printer_admin_offline(client: AsyncClient, auth_headers: dict[str, str]):
    """POST /api/v1/admin/hardware/printer/test returns failure when printer offline."""
    mock_result = PrintTestResponse(
        success=False,
        message='Printer is offline or not connected',
    )

    with patch('app.services.printer_service.print_test_page', return_value=mock_result):
        resp = await client.post('/api/v1/admin/hardware/printer/test', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is False


# ---------------------------------------------------------------------------
# Printer endpoint tests (separate from admin printer test)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_print_status_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """GET /api/v1/print/status with auth returns printer status."""
    mock_status = PrintStatusResponse(
        connected=False,
        printer=None,
        status=None,
        last_print_at=None,
        total_prints_today=0,
    )

    with patch('app.api.v1.endpoints.printer.get_printer_status', return_value=mock_status):
        resp = await client.get('/api/v1/print/status', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['connected'] is False


@pytest.mark.asyncio
async def test_print_status_without_auth_returns_401_or_403(client: AsyncClient):
    """GET /api/v1/print/status without auth returns 401 or 403."""
    resp = await client.get('/api/v1/print/status')

    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_print_test_with_auth_returns_200(client: AsyncClient, auth_headers: dict[str, str]):
    """POST /api/v1/print/test with auth returns test print result."""
    mock_result = PrintTestResponse(
        success=True,
        message='Test print sent successfully',
        printer_info=None,
    )

    with patch('app.api.v1.endpoints.printer.print_test_page', return_value=mock_result):
        resp = await client.post('/api/v1/print/test', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['success'] is True


@pytest.mark.asyncio
async def test_print_test_without_auth_returns_401_or_403(client: AsyncClient):
    """POST /api/v1/print/test without auth returns 401 or 403."""
    resp = await client.post('/api/v1/print/test')

    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_print_status_connected(client: AsyncClient, auth_headers: dict[str, str]):
    """GET /api/v1/print/status returns printer info when connected."""
    from app.schemas.print import PrinterInfo, PrintHardwareStatus

    mock_status = PrintStatusResponse(
        connected=True,
        printer=PrinterInfo(
            vendor='USB',
            model='VID:0x04b8 PID:0x0e15',
            vendor_id='0x04b8',
            product_id='0x0e15',
        ),
        status=PrintHardwareStatus(
            paper_ok=True,
            printer_online=True,
        ),
        last_print_at=None,
        total_prints_today=5,
    )

    with patch('app.api.v1.endpoints.printer.get_printer_status', return_value=mock_status):
        resp = await client.get('/api/v1/print/status', headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data['connected'] is True
    assert data['printer'] is not None
    assert data['printer']['vendor_id'] == '0x04b8'
    assert data['total_prints_today'] == 5


# ---------------------------------------------------------------------------
# Rate limiting tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_rate_limiting(client: AsyncClient):
    """POST /api/v1/admin/login rate limits after too many failed attempts."""
    # The default max failed attempts is 5
    for _ in range(5):
        resp = await client.post('/api/v1/admin/login', json={'pin': '0000'})
        assert resp.status_code == 401

    # 6th attempt should be rate limited
    resp = await client.post('/api/v1/admin/login', json={'pin': '0000'})
    assert resp.status_code == 429
    data = resp.json()
    assert data['error']['code'] == 'RATE_LIMITED'
