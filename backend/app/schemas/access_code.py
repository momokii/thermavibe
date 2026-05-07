"""Pydantic schemas for access code API endpoints.

Covers code creation (single/batch), validation, redemption,
listing, and revocation.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class AccessCodeCreateRequest(BaseModel):
    """Request body for generating access codes (single or batch)."""

    code_type: str = Field(
        default='universal',
        pattern=r'^(vibe_check|photobooth|universal)$',
        description='Feature type this code unlocks',
    )
    count: int = Field(default=1, ge=1, le=100, description='Number of codes to generate')
    max_uses: int = Field(default=1, ge=1, description='Max redemptions per code')
    expires_at: datetime | None = Field(default=None, description='Expiration timestamp (null = no expiry)')
    notes: str | None = Field(default=None, max_length=500, description='Admin notes')
    price: int | None = Field(
        default=None,
        ge=0,
        description='Price per redemption in smallest currency unit (null = use global default)',
    )


class AccessCodeResponse(BaseModel):
    """Single access code in API responses."""

    id: int
    code: str
    code_type: str
    max_uses: int
    use_count: int
    status: str
    expires_at: datetime | None = None
    notes: str | None = None
    price: int | None = None
    created_at: datetime
    created_by: str

    model_config = {'from_attributes': True}


class AccessCodeListResponse(BaseModel):
    """Paginated access code listing response."""

    codes: list[AccessCodeResponse]
    total: int


class AccessCodeValidateRequest(BaseModel):
    """Request body for validating an access code."""

    code: str = Field(min_length=1, max_length=32, description='Access code string')
    session_type: str = Field(
        pattern=r'^(vibe_check|photobooth)$',
        description='Session type to validate against',
    )


class AccessCodeValidateResponse(BaseModel):
    """Response from access code validation."""

    valid: bool
    message: str
    access_code_id: int | None = None


class AccessCodeSummaryResponse(BaseModel):
    """Pre-computed access code summary statistics."""

    total_codes: int
    active_codes: int
    used_codes: int
    total_redemptions: int
    total_max_uses: int
    redemption_rate: float
    estimated_revenue: int


class RedeemCodeRequest(BaseModel):
    """Request body for redeeming an access code against a session."""

    code: str = Field(min_length=1, max_length=32, description='Access code to redeem')
