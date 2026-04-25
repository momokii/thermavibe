"""Pydantic schemas for photobooth API endpoints.

Covers photobooth session flow: snap, frame selection, arrange,
composite generation, printing, and sharing.
Also covers admin theme management.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Theme configuration (stored as JSONB in photobooth_themes.config)
# ---------------------------------------------------------------------------


class BackgroundConfig(BaseModel):
    """Theme background configuration."""

    type: str = Field(default='solid', pattern=r'^(solid|gradient)$')
    color: str = Field(default='#000000', description='Hex color for solid background')
    gradient_start: str = Field(default='#1a1a2e', description='Gradient start color')
    gradient_end: str = Field(default='#16213e', description='Gradient end color')


class PhotoSlotConfig(BaseModel):
    """Photo slot border and spacing configuration."""

    border_width: int = Field(default=4, ge=0, le=20)
    border_color: str = Field(default='#ffffff')
    border_radius: int = Field(default=0, ge=0, le=30)
    padding: int = Field(default=8, ge=0, le=30)
    shadow: bool = Field(default=True)


class DecorationConfig(BaseModel):
    """Decorative elements for the strip."""

    top_banner: bool = Field(default=True)
    banner_text: str = Field(default='VibePrint')
    divider_style: str = Field(default='line', pattern=r'^(line|dotted|none)$')
    divider_color: str = Field(default='#ffffff')
    date_format: str = Field(default='%Y-%m-%d')


class FontConfig(BaseModel):
    """Font settings for text overlays."""

    family: str = Field(default='default')
    color: str = Field(default='#ffffff')
    size: int = Field(default=24, ge=10, le=72)


class WatermarkConfig(BaseModel):
    """Watermark overlay settings."""

    enabled: bool = Field(default=False)
    text: str = Field(default='')
    position: str = Field(default='bottom-right', pattern=r'^(bottom-right|bottom-left|bottom-center)$')
    opacity: float = Field(default=0.3, ge=0.0, le=1.0)


class ThemeConfig(BaseModel):
    """Complete theme configuration stored as JSONB."""

    background: BackgroundConfig = Field(default_factory=BackgroundConfig)
    photo_slot: PhotoSlotConfig = Field(default_factory=PhotoSlotConfig)
    decorations: DecorationConfig = Field(default_factory=DecorationConfig)
    font: FontConfig = Field(default_factory=FontConfig)
    watermark: WatermarkConfig = Field(default_factory=WatermarkConfig)


# ---------------------------------------------------------------------------
# Kiosk-facing request / response schemas
# ---------------------------------------------------------------------------


class PhotoboothSessionCreateRequest(BaseModel):
    """Request body for creating a photobooth session."""

    payment_enabled: bool = Field(default=False)
    session_type: str = Field(default='photobooth', pattern=r'^(vibe_check|photobooth)$')


class PhotoboothSnapResponse(BaseModel):
    """Response after snapping a photo in photobooth mode."""

    id: UUID
    state: str
    photo_url: str = Field(description='URL of the snapped photo')
    photo_index: int = Field(description='Index in the session photos array')
    total_photos: int = Field(description='Total photos captured so far')
    time_remaining_seconds: float = Field(description='Seconds left in capture window')

    model_config = {'from_attributes': True}


class FrameSelectRequest(BaseModel):
    """Request body for selecting frame layout and theme."""

    theme_id: int = Field(description='ID of the selected theme')
    layout_rows: int = Field(ge=1, le=4, description='Number of photo rows (1-4)')


class ArrangeRequest(BaseModel):
    """Request body for assigning photos to frame slots.

    Keys are slot indices (0..layout_rows-1), values are photo indices
    from the session's photos array.
    """

    photo_assignments: dict[int, int] = Field(
        description='Map of slot index to photo index',
    )


class PhotoboothSessionResponse(BaseModel):
    """Extended session response with photobooth-specific fields."""

    id: UUID
    state: str
    session_type: str = 'photobooth'
    payment_enabled: bool = False
    payment_status: str | None = None
    photos: list[dict] = Field(default_factory=list)
    photobooth_layout: dict | None = None
    composite_image_url: str | None = None
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {'from_attributes': True}


class ShareResponse(BaseModel):
    """Response with temporary share URL and QR data."""

    share_url: str = Field(description='Temporary URL for downloading the composite image')
    expires_in: int = Field(description='Seconds until the share URL expires')
    qr_data: str = Field(description='URL string to encode in QR code')


class FeaturesResponse(BaseModel):
    """Public response listing enabled features for kiosk init."""

    vibe_check_enabled: bool = True
    photobooth_enabled: bool = True
    photobooth_max_photos: int = 8
    photobooth_min_photos: int = 2
    photobooth_capture_time_limit_seconds: int = 30
    photobooth_default_layout_rows: int = 4


# ---------------------------------------------------------------------------
# Admin theme management schemas
# ---------------------------------------------------------------------------


class ThemeResponse(BaseModel):
    """Theme data for API responses."""

    id: int
    name: str
    display_name: str
    config: ThemeConfig
    preview_image_url: str | None = None
    is_builtin: bool = False
    is_enabled: bool = True
    is_default: bool = False
    sort_order: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {'from_attributes': True}


class ThemeCreateRequest(BaseModel):
    """Request body for creating a custom theme."""

    name: str = Field(min_length=1, max_length=128, pattern=r'^[a-z0-9_]+$')
    display_name: str = Field(min_length=1, max_length=255)
    config: ThemeConfig = Field(default_factory=ThemeConfig)


class ThemeUpdateRequest(BaseModel):
    """Request body for updating a theme."""

    display_name: str | None = None
    config: ThemeConfig | None = None
    sort_order: int | None = None
