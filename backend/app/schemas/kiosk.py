"""Pydantic schemas for kiosk session API endpoints.

Covers session creation, retrieval, capture, print, and finish flows.
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
