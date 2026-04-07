"""Operator admin dashboard API endpoints."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db_session
from app.core.config import settings
from app.core.security import create_access_token, get_token_expiry, verify_pin
from app.schemas.admin import (
    ConfigAllResponse,
    ConfigUpdateRequest,
    ConfigUpdateResponse,
    HardwareStatusResponse,
    LoginRequest,
    LoginResponse,
    RevenueAnalyticsResponse,
    SessionAnalyticsResponse,
)
from app.schemas.print import PrintTestResponse
from app.services import analytics_service, config_service
from app.services.hardware_service import get_full_hardware_status, test_camera_capture

router = APIRouter()


@router.post('/login', response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
) -> LoginResponse:
    """Authenticate with admin PIN and receive a JWT token."""
    ip_address = request.client.host if request.client else 'unknown'
    verify_pin(body.pin, ip_address)

    token = create_access_token(subject='admin')
    expires_at = get_token_expiry()

    return LoginResponse(
        token=token,
        token_type='Bearer',
        expires_in=86400,  # 24 hours
        expires_at=expires_at,
    )


@router.get('/config', response_model=ConfigAllResponse)
async def get_config(
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> ConfigAllResponse:
    """Get all configuration values grouped by category."""
    categories = await config_service.get_all_configs(db)
    return ConfigAllResponse(categories=categories)


@router.put('/config/{category}', response_model=ConfigUpdateResponse)
async def update_config(
    category: str,
    body: ConfigUpdateRequest,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> ConfigUpdateResponse:
    """Update configuration values for a category."""
    values = {k: str(v) for k, v in body.model_dump(exclude_unset=True).items()}
    updated = await config_service.update_config(db, category, values)
    all_values = await config_service.get_configs_by_category(db, category)

    return ConfigUpdateResponse(
        category=category,
        updated_fields=updated,
        all_values=all_values,
    )


@router.get('/analytics/sessions', response_model=SessionAnalyticsResponse)
async def session_analytics(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    group_by: str = 'day',
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> SessionAnalyticsResponse:
    """Get session analytics with summary and timeseries."""
    return await analytics_service.get_session_analytics(
        db=db,
        start_date=start_date,
        end_date=end_date,
        group_by=group_by,
    )


@router.get('/analytics/revenue', response_model=RevenueAnalyticsResponse)
async def revenue_analytics(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    group_by: str = 'day',
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> RevenueAnalyticsResponse:
    """Get revenue analytics with summary and timeseries."""
    return await analytics_service.get_revenue_analytics(
        db=db,
        start_date=start_date,
        end_date=end_date,
        group_by=group_by,
    )


@router.get('/hardware/status', response_model=HardwareStatusResponse)
async def hardware_status(
    _admin: dict = Depends(get_current_admin),
) -> HardwareStatusResponse:
    """Get combined hardware status (camera, printer, system)."""
    return get_full_hardware_status()


@router.post('/hardware/camera/test')
async def test_camera(
    _admin: dict = Depends(get_current_admin),
) -> dict:
    """Test camera capture and return result."""
    return test_camera_capture()


@router.post('/hardware/printer/test', response_model=PrintTestResponse)
async def test_printer(
    _admin: dict = Depends(get_current_admin),
) -> PrintTestResponse:
    """Test printer connectivity with a test page."""
    from app.services.printer_service import print_test_page

    return print_test_page()
