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
from app.schemas.photobooth import (
    ThemeCreateRequest,
    ThemeResponse,
    ThemeUpdateRequest,
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

    ttl_seconds = settings.admin_session_ttl_hours * 3600

    return LoginResponse(
        token=token,
        token_type='Bearer',
        expires_in=ttl_seconds,
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
    raw = body.model_dump(exclude_unset=True)
    values = {k: str(v).lower() if isinstance(v, bool) else str(v) for k, v in raw.items()}
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


# ---------------------------------------------------------------------------
# Photobooth theme management
# ---------------------------------------------------------------------------

@router.get('/photobooth/themes')
async def list_themes(
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """List all photobooth themes."""
    from app.services import theme_service
    from app.schemas.photobooth import ThemeResponse

    themes = await theme_service.list_themes(db, enabled_only=False)
    return [
        ThemeResponse(
            id=t.id,
            name=t.name,
            display_name=t.display_name,
            config=t.config,
            preview_image_url=None,
            is_builtin=t.is_builtin,
            is_enabled=t.is_enabled,
            is_default=t.is_default,
            sort_order=t.sort_order,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in themes
    ]


@router.post('/photobooth/themes', status_code=201)
async def create_theme(
    body: ThemeCreateRequest,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new custom photobooth theme."""
    from app.services import theme_service

    theme = await theme_service.create_theme(
        db=db,
        name=body.name,
        display_name=body.display_name,
        config=body.config,
    )

    return ThemeResponse(
        id=theme.id,
        name=theme.name,
        display_name=theme.display_name,
        config=theme.config,
        preview_image_url=None,
        is_builtin=theme.is_builtin,
        is_enabled=theme.is_enabled,
        is_default=theme.is_default,
        sort_order=theme.sort_order,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
    )


@router.put('/photobooth/themes/{theme_id}')
async def update_theme(
    theme_id: int,
    body: ThemeUpdateRequest,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a photobooth theme."""
    from app.services import theme_service

    kwargs: dict = {}
    if body.display_name is not None:
        kwargs['display_name'] = body.display_name
    if body.config is not None:
        kwargs['config'] = body.config.model_dump()
    if body.sort_order is not None:
        kwargs['sort_order'] = body.sort_order

    theme = await theme_service.update_theme(db=db, theme_id=theme_id, **kwargs)

    return ThemeResponse(
        id=theme.id,
        name=theme.name,
        display_name=theme.display_name,
        config=theme.config,
        preview_image_url=None,
        is_builtin=theme.is_builtin,
        is_enabled=theme.is_enabled,
        is_default=theme.is_default,
        sort_order=theme.sort_order,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
    )


@router.patch('/photobooth/themes/{theme_id}/toggle')
async def toggle_theme(
    theme_id: int,
    body: dict,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Enable or disable a photobooth theme."""
    from app.services import theme_service

    enabled = body.get('enabled', True)

    theme = await theme_service.toggle_theme(db=db, theme_id=theme_id, enabled=enabled)

    return ThemeResponse(
        id=theme.id,
        name=theme.name,
        display_name=theme.display_name,
        config=theme.config,
        preview_image_url=None,
        is_builtin=theme.is_builtin,
        is_enabled=theme.is_enabled,
        is_default=theme.is_default,
        sort_order=theme.sort_order,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
    )


@router.patch('/photobooth/themes/{theme_id}/default')
async def set_default_theme(
    theme_id: int,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Set a theme as the default."""
    from app.services import theme_service
    from app.schemas.photobooth import ThemeResponse

    theme = await theme_service.set_default_theme(db=db, theme_id=theme_id)

    return ThemeResponse(
        id=theme.id,
        name=theme.name,
        display_name=theme.display_name,
        config=theme.config,
        preview_image_url=None,
        is_builtin=theme.is_builtin,
        is_enabled=theme.is_enabled,
        is_default=theme.is_default,
        sort_order=theme.sort_order,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
    )


@router.delete('/photobooth/themes/{theme_id}', status_code=204)
async def delete_theme(
    theme_id: int,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a custom photobooth theme (built-in themes cannot be deleted)."""
    from app.services import theme_service

    await theme_service.delete_theme(db=db, theme_id=theme_id)
