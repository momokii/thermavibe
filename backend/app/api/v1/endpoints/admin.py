"""Operator admin dashboard API endpoints."""

from __future__ import annotations

import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_db_session
from app.core.config import settings
from app.core.security import create_access_token, get_token_expiry, verify_pin
from app.schemas.admin import (
    ConfigAllResponse,
    ConfigUpdateRequest,
    ConfigUpdateResponse,
    DropoffFunnelResponse,
    FeatureBreakdownResponse,
    HardwareStatusResponse,
    LoginRequest,
    LoginResponse,
    PeakHoursResponse,
    PrintStatsResponse,
    RevenueAnalyticsResponse,
    SessionAnalyticsResponse,
)
from app.schemas.access_code import (
    AccessCodeCreateRequest,
    AccessCodeListResponse,
    AccessCodeResponse,
    AccessCodeSummaryResponse,
)
from app.schemas.photobooth import (
    ThemeCreateRequest,
    ThemeResponse,
    ThemeUpdateRequest,
    StripGalleryResponse,
    StripGalleryItem,
    VibeCheckResultsResponse,
    VibeCheckResultItem,
)
from app.schemas.print import PrintTestResponse
from app.schemas.common import SuccessMessage
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

    # Guard: at least one kiosk feature must remain enabled
    feature_keys = {
        'vibe_check': 'vibe_check_enabled',
        'photobooth': 'photobooth_enabled',
    }
    if category in feature_keys:
        disabling = values.get(feature_keys[category], '').lower() in ('false', '0')
        if disabling:
            other_cat = 'photobooth' if category == 'vibe_check' else 'vibe_check'
            other_config = await config_service.get_configs_by_category(db, other_cat)
            other_enabled = other_config.get(feature_keys[other_cat], 'true').lower() == 'true'
            if not other_enabled:
                raise HTTPException(
                    status_code=422,
                    detail='At least one feature (Vibe Check or Photobooth) must stay enabled.',
                )

    # Guard: access code mode and payment are mutually exclusive
    if category == 'access_code' and values.get('access_code_mode_enabled', '').lower() == 'true':
        await config_service.update_config(db, 'payment', {'payment_enabled': 'false'})
    elif category == 'payment' and values.get('payment_enabled', '').lower() == 'true':
        await config_service.update_config(db, 'access_code', {'access_code_mode_enabled': 'false'})

    # Guard: AI timeout must be between 1 and 30 minutes
    if category == 'ai' and 'ai_timeout_minutes' in values:
        try:
            timeout_val = int(values['ai_timeout_minutes'])
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=422,
                detail='AI timeout must be a valid number.',
            )
        if timeout_val < 1 or timeout_val > 30:
            raise HTTPException(
                status_code=422,
                detail='AI timeout must be between 1 and 30 minutes.',
            )

    # Guard: print config validation
    if category == 'print':
        import re

        if 'print_footer_name' in values and len(values['print_footer_name']) > 24:
            raise HTTPException(
                status_code=422,
                detail='Footer name must be 24 characters or fewer.',
            )
        if 'print_timezone_offset' in values:
            if not re.match(r'^[+-]?\d{1,2}$', values['print_timezone_offset']):
                raise HTTPException(
                    status_code=422,
                    detail='Timezone offset must be a number like +7, -5, or +0.',
                )
            offset_val = int(values['print_timezone_offset'])
            if offset_val < -14 or offset_val > 14:
                raise HTTPException(
                    status_code=422,
                    detail='Timezone offset must be between -14 and +14.',
                )

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


@router.get('/analytics/features', response_model=FeatureBreakdownResponse)
async def feature_breakdown(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> FeatureBreakdownResponse:
    """Get per-feature analytics breakdown (vibe_check vs photobooth)."""
    return await analytics_service.get_feature_breakdown(
        db=db,
        start_date=start_date,
        end_date=end_date,
    )


@router.get('/analytics/peak-hours', response_model=PeakHoursResponse)
async def peak_hours(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> PeakHoursResponse:
    """Get session distribution by day-of-week and hour."""
    return await analytics_service.get_peak_hours(
        db=db,
        start_date=start_date,
        end_date=end_date,
    )


@router.get('/analytics/dropoff', response_model=DropoffFunnelResponse)
async def dropoff_funnel(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    session_type: str | None = None,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> DropoffFunnelResponse:
    """Get drop-off funnel showing where abandoned sessions ended up."""
    return await analytics_service.get_dropoff_funnel(
        db=db,
        start_date=start_date,
        end_date=end_date,
        session_type=session_type,
    )


@router.get('/analytics/print-stats', response_model=PrintStatsResponse)
async def print_stats(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> PrintStatsResponse:
    """Get print success/failure statistics."""
    return await analytics_service.get_print_stats(
        db=db,
        start_date=start_date,
        end_date=end_date,
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

    try:
        theme = await theme_service.toggle_theme(db=db, theme_id=theme_id, enabled=enabled)
    except ValueError as exc:
        from fastapi import HTTPException

        raise HTTPException(status_code=409, detail=str(exc)) from exc

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


# ---------------------------------------------------------------------------
# Strip gallery
# ---------------------------------------------------------------------------


@router.get('/photobooth/strips', response_model=StripGalleryResponse)
async def list_strips(
    limit: int = 24,
    offset: int = 0,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> StripGalleryResponse:
    """List photobooth sessions that have a composite image on disk."""
    import os

    from sqlalchemy import select, func

    from app.models.session import KioskSession, SessionType
    from app.models.photobooth_theme import PhotoboothTheme

    base_filter = (
        (KioskSession.session_type == SessionType.PHOTOBOOTH)
        & (KioskSession.composite_image_path.isnot(None))  # type: ignore[union-attr]
    )

    # Fetch more than needed to account for missing files, then trim.
    fetch_limit = limit * 3
    stmt = (
        select(KioskSession)
        .where(base_filter)
        .order_by(KioskSession.created_at.desc())
        .limit(fetch_limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    strips: list[StripGalleryItem] = []
    for session in sessions:
        if len(strips) >= limit:
            break
        # Skip sessions whose composite file no longer exists on disk.
        if not os.path.exists(session.composite_image_path):
            continue

        theme_name = None
        layout = session.photobooth_layout or {}
        theme_id = layout.get('theme_id')
        if theme_id:
            theme_stmt = select(PhotoboothTheme.display_name).where(PhotoboothTheme.id == theme_id)
            theme_row = (await db.execute(theme_stmt)).scalar_one_or_none()
            if theme_row:
                theme_name = theme_row

        strips.append(StripGalleryItem(
            session_id=session.id,
            composite_url=f'/api/v1/kiosk/session/{session.id}/photobooth/composite',
            thumbnail_url=f'/api/v1/kiosk/session/{session.id}/photobooth/thumbnail',
            created_at=session.created_at,
            theme_name=theme_name,
        ))

    # Count total available strips (files that still exist).
    count_stmt = select(KioskSession.id, KioskSession.composite_image_path).where(base_filter)
    count_result = await db.execute(count_stmt)
    total = sum(1 for row in count_result if os.path.exists(row[1]))

    return StripGalleryResponse(strips=strips, total=total)


@router.get('/vibe-check/results', response_model=VibeCheckResultsResponse)
async def list_vibe_check_results(
    limit: int = 24,
    offset: int = 0,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> VibeCheckResultsResponse:
    """List completed vibe check sessions with AI analysis results."""
    import os

    from sqlalchemy import select

    from app.models.session import KioskSession, SessionType

    base_filter = (
        (KioskSession.session_type == SessionType.VIBE_CHECK)
        & (KioskSession.photo_path.isnot(None))  # type: ignore[union-attr]
        & (KioskSession.ai_response_text.isnot(None))  # type: ignore[union-attr]
    )

    # Over-fetch to account for missing files, then trim.
    fetch_limit = limit * 3
    stmt = (
        select(KioskSession)
        .where(base_filter)
        .order_by(KioskSession.created_at.desc())
        .limit(fetch_limit)
        .offset(offset)
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    results: list[VibeCheckResultItem] = []
    for session in sessions:
        if len(results) >= limit:
            break
        if not os.path.exists(session.photo_path):
            continue

        results.append(VibeCheckResultItem(
            session_id=session.id,
            photo_url=f'/api/v1/kiosk/session/{session.id}/photo',
            thumbnail_url=f'/api/v1/kiosk/session/{session.id}/photo/thumb',
            created_at=session.created_at,
            analysis_text=session.ai_response_text,
            analysis_provider=session.ai_provider_used,
        ))

    # Count total with existing files.
    count_stmt = select(KioskSession.id, KioskSession.photo_path).where(base_filter)
    count_result = await db.execute(count_stmt)
    total = sum(1 for row in count_result if os.path.exists(row[1]))

    return VibeCheckResultsResponse(results=results, total=total)


# ---------------------------------------------------------------------------
# Gallery item actions (delete / print)
# ---------------------------------------------------------------------------


@router.delete('/gallery/{session_id}', response_model=SuccessMessage)
async def delete_gallery_item(
    session_id: str,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> SuccessMessage:
    """Permanently delete image files and clear DB references for a session.

    Uses the same purge logic as the retention service.
    """
    from sqlalchemy import select

    from app.models.session import KioskSession, SessionType
    from app.services.retention_service import _find_thumbnail, _safe_remove

    stmt = select(KioskSession).where(KioskSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(status_code=404, detail='Session not found')

    purged = False

    if session.composite_image_path:
        _safe_remove(session.composite_image_path)
        thumb = _find_thumbnail(session.composite_image_path)
        if thumb:
            _safe_remove(thumb)
        session.composite_image_path = None
        purged = True

    if session.photo_path:
        _safe_remove(session.photo_path)
        thumb = _find_thumbnail(session.photo_path)
        if thumb:
            _safe_remove(thumb)
        session.photo_path = None
        session.ai_response_text = None
        session.ai_provider_used = None
        purged = True

    if not purged:
        raise HTTPException(status_code=400, detail='No image data to delete')

    await db.commit()
    return SuccessMessage(message='Image deleted permanently')


@router.post('/gallery/{session_id}/print', response_model=SuccessMessage)
async def print_gallery_item(
    session_id: str,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> SuccessMessage:
    """Manually print a gallery item (photobooth strip or vibe check receipt)."""
    from sqlalchemy import select

    from app.models.session import KioskSession, SessionType

    stmt = select(KioskSession).where(KioskSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if session is None:
        raise HTTPException(status_code=404, detail='Session not found')

    # Read print config for consistent footers
    print_cfg = await config_service.get_configs_by_category(db, 'print')

    footer_name = print_cfg.get('print_footer_name', 'VibePrint OS')
    try:
        tz_offset = int(print_cfg.get('print_timezone_offset', '+7'))
    except (ValueError, TypeError):
        tz_offset = 7
    footer_enabled = print_cfg.get('print_footer_enabled', 'true').lower() == 'true'
    name_enabled = print_cfg.get('print_footer_name_enabled', 'true').lower() == 'true'
    timestamp_enabled = print_cfg.get('print_footer_timestamp_enabled', 'true').lower() == 'true'
    footer_kwargs = {
        'footer_name': footer_name,
        'timezone_offset': tz_offset,
        'footer_enabled': footer_enabled,
        'name_enabled': name_enabled,
        'timestamp_enabled': timestamp_enabled,
    }

    if session.session_type == SessionType.PHOTOBOOTH:
        if not session.composite_image_path or not os.path.exists(session.composite_image_path):
            raise HTTPException(status_code=400, detail='No composite image to print')
        try:
            from app.services.printer_service import print_photobooth_strip

            res = print_photobooth_strip(session.composite_image_path, **footer_kwargs)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f'Print failed: {exc}') from exc
    elif session.session_type == SessionType.VIBE_CHECK:
        if not session.ai_response_text:
            raise HTTPException(status_code=400, detail='No AI reading to print')
        try:
            from app.services.printer_service import print_receipt

            photo_bytes = None
            if session.photo_path and os.path.exists(session.photo_path):
                with open(session.photo_path, 'rb') as f:
                    photo_bytes = f.read()

            res = print_receipt(
                ai_text=session.ai_response_text,
                photo_bytes=photo_bytes,
                include_photo=True,
                **footer_kwargs,
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f'Print failed: {exc}') from exc
    else:
        raise HTTPException(status_code=400, detail='Unknown session type')

    return SuccessMessage(message=res.get('message', 'Print sent'))


# ---------------------------------------------------------------------------
# Access code management
# ---------------------------------------------------------------------------


@router.get('/access-codes/summary', response_model=AccessCodeSummaryResponse)
async def access_code_summary(
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AccessCodeSummaryResponse:
    """Pre-computed aggregate stats across all access codes."""
    from app.services import access_code_service

    stats = await access_code_service.get_summary(db)
    return AccessCodeSummaryResponse(**stats)


@router.get('/access-codes', response_model=AccessCodeListResponse)
async def list_access_codes(
    status: str | None = None,
    code_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AccessCodeListResponse:
    """List access codes with optional filters and pagination."""
    from app.services import access_code_service

    codes, total = await access_code_service.list_codes(
        db=db,
        status=status,
        code_type=code_type,
        limit=limit,
        offset=offset,
    )
    return AccessCodeListResponse(
        codes=[AccessCodeResponse.model_validate(c) for c in codes],
        total=total,
    )


@router.post('/access-codes', status_code=201)
async def create_access_codes(
    body: AccessCodeCreateRequest,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> list[AccessCodeResponse]:
    """Generate access codes (single or batch up to 100)."""
    from app.services import access_code_service

    code_price = body.price if body.price is not None else settings.payment_amount

    codes = await access_code_service.generate_batch(
        db=db,
        code_type=body.code_type,
        count=body.count,
        max_uses=body.max_uses,
        expires_at=body.expires_at,
        notes=body.notes,
        price=code_price,
    )
    return [AccessCodeResponse.model_validate(c) for c in codes]


@router.patch('/access-codes/{code_id}/revoke')
async def revoke_access_code(
    code_id: int,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AccessCodeResponse:
    """Revoke an access code, preventing further use."""
    from app.services import access_code_service

    try:
        code = await access_code_service.revoke_code(db=db, code_id=code_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return AccessCodeResponse.model_validate(code)


@router.delete('/access-codes/{code_id}', status_code=204)
async def delete_access_code(
    code_id: int,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Hard-delete an access code if no sessions reference it."""
    from app.services import access_code_service

    try:
        deleted = await access_code_service.delete_code(db=db, code_id=code_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail=f'Access code {code_id} not found')


@router.get('/access-codes/{code_id}/qr')
async def get_access_code_qr(
    code_id: int,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Generate a QR code PNG for an access code."""
    import io

    import qrcode
    from fastapi.responses import StreamingResponse

    from app.services import access_code_service as svc
    from sqlalchemy import select
    from app.models.access_code import AccessCode

    stmt = select(AccessCode).where(AccessCode.id == code_id)
    result = await db.execute(stmt)
    code = result.scalar_one_or_none()

    if code is None:
        raise HTTPException(status_code=404, detail=f'Access code {code_id} not found')

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(code.code)
    qr.make(fit=True)
    img = qr.make_image(fill_color='black', back_color='white')

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)

    return StreamingResponse(buf, media_type='image/png')


@router.post('/access-codes/{code_id}/print', response_model=SuccessMessage)
async def print_access_code(
    code_id: int,
    _admin: dict = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db_session),
) -> SuccessMessage:
    """Print an access code receipt to the thermal printer."""
    from sqlalchemy import select

    from app.models.access_code import AccessCode, AccessCodeStatus
    from app.services.printer_service import print_access_code as do_print

    stmt = select(AccessCode).where(AccessCode.id == code_id)
    result = await db.execute(stmt)
    code = result.scalar_one_or_none()

    if code is None:
        raise HTTPException(status_code=404, detail=f'Access code {code_id} not found')

    if code.status != AccessCodeStatus.ACTIVE:
        raise HTTPException(status_code=400, detail='Only active codes can be printed')

    # Read print config for consistent footers
    print_cfg = await config_service.get_configs_by_category(db, 'print')
    footer_name = print_cfg.get('print_footer_name', 'VibePrint OS')
    try:
        tz_offset = int(print_cfg.get('print_timezone_offset', '+7'))
    except (ValueError, TypeError):
        tz_offset = 7
    footer_enabled = print_cfg.get('print_footer_enabled', 'true').lower() == 'true'
    name_enabled = print_cfg.get('print_footer_name_enabled', 'true').lower() == 'true'
    timestamp_enabled = print_cfg.get('print_footer_timestamp_enabled', 'true').lower() == 'true'

    try:
        res = do_print(
            code=code.code,
            code_type=code.code_type,
            max_uses=code.max_uses,
            price=code.price,
            expires_at=code.expires_at,
            notes=code.notes,
            footer_name=footer_name,
            timezone_offset=tz_offset,
            footer_enabled=footer_enabled,
            name_enabled=name_enabled,
            timestamp_enabled=timestamp_enabled,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Print failed: {exc}') from exc

    return SuccessMessage(message=res.get('message', 'Print sent'))
