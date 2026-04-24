"""Pydantic schemas for kiosk session API endpoints.

Covers session creation, retrieval, snap, select, capture, print, and finish flows.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreateRequest(BaseModel):
    """Request body for POST /api/v1/kiosk/session."""

    payment_enabled: bool = Field(
        default=False,
        description='Whether the payment step is enabled for this session',
    )
    session_type: str = Field(
        default='vibe_check',
        pattern=r'^(vibe_check|photobooth)$',
        description='Session type: vibe_check or photobooth',
    )


class PhotoEntry(BaseModel):
    """A single photo taken during the capture phase."""

    photo_url: str = Field(description='URL to fetch the JPEG image')
    captured_at: str = Field(description='ISO timestamp when photo was taken')


class SessionResponse(BaseModel):
    """Response for session endpoints (create, get, capture, print)."""

    id: UUID
    state: str
    payment_enabled: bool = False
    payment_status: str | None = None
    captured_at: datetime | None = None
    capture_image_url: str | None = None
    analysis_text: str | None = None
    analysis_provider: str | None = None
    printed_at: datetime | None = None
    print_success: bool | None = None
    created_at: datetime
    updated_at: datetime | None = None
    expires_at: datetime | None = None
    photos: list[PhotoEntry] = Field(default_factory=list, description='All photos taken this session')
    capture_time_limit: int | None = Field(default=None, description='Capture time limit in seconds')

    model_config = {'from_attributes': True}


class SessionFinishResponse(BaseModel):
    """Response for POST /api/v1/kiosk/session/{id}/finish."""

    id: UUID
    state: str
    message: str
    duration_seconds: float

    model_config = {'from_attributes': True}


class CaptureResponse(BaseModel):
    """Response after triggering a photo capture."""

    id: UUID
    state: str
    payment_enabled: bool = False
    payment_status: str | None = None
    captured_at: datetime | None = None
    capture_image_url: str | None = None
    analysis_text: str | None = None
    analysis_provider: str | None = None
    printed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None
    expires_at: datetime | None = None

    model_config = {'from_attributes': True}


class SnapResponse(BaseModel):
    """Response after snapping a photo (no AI analysis yet)."""

    id: UUID
    state: str
    photos: list[PhotoEntry] = Field(default_factory=list)
    photo_url: str = Field(description='URL of the just-snapped photo')
    photo_index: int = Field(description='Index of the snapped photo in the photos array')
    time_remaining_seconds: float = Field(description='Seconds left in the capture window')

    model_config = {'from_attributes': True}


class SelectRequest(BaseModel):
    """Request body for POST /api/v1/kiosk/session/{id}/select."""

    photo_index: int = Field(
        ge=0,
        description='Index of the photo to select for AI analysis',
    )
