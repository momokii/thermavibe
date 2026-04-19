"""Pydantic schemas for admin API endpoints.

Covers authentication, analytics, and hardware status for the admin dashboard.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Auth ---

class LoginRequest(BaseModel):
    """Request body for POST /api/v1/admin/login."""

    pin: str = Field(..., min_length=4, max_length=6, description='Admin PIN code')


class LoginResponse(BaseModel):
    """Response for POST /api/v1/admin/login."""

    token: str = Field(..., description='JWT access token')
    token_type: str = 'Bearer'
    expires_in: int = Field(..., description='Token lifetime in seconds')
    expires_at: datetime = Field(..., description='Token expiry timestamp')


# --- Config ---

class ConfigAllResponse(BaseModel):
    """Response for GET /api/v1/admin/config."""

    categories: dict[str, dict[str, Any]] = Field(
        ...,
        description='Configuration values organized by category',
    )


class ConfigUpdateRequest(BaseModel):
    """Request body for PUT /api/v1/admin/config/{category}.

    Keys are configuration field names, values are the new values.
    """

    model_config = {'extra': 'allow'}


class ConfigUpdateResponse(BaseModel):
    """Response for PUT /api/v1/admin/config/{category}."""

    category: str
    updated_fields: dict[str, Any]
    all_values: dict[str, Any]


# --- Analytics ---

class SessionAnalyticsSummary(BaseModel):
    """Summary statistics for session analytics."""

    total_sessions: int
    completed_sessions: int
    abandoned_sessions: int
    completion_rate: float
    avg_duration_seconds: float


class SessionTimeseriesPoint(BaseModel):
    """A single data point in session analytics timeseries."""

    period: str
    sessions: int
    completed: int
    abandoned: int
    avg_duration_seconds: float


class SessionAnalyticsResponse(BaseModel):
    """Response for GET /api/v1/admin/analytics/sessions."""

    summary: SessionAnalyticsSummary
    state_distribution: dict[str, int]
    timeseries: list[SessionTimeseriesPoint]
    page: int
    per_page: int
    total_periods: int


class RevenueAnalyticsSummary(BaseModel):
    """Summary statistics for revenue analytics."""

    total_revenue: int
    total_transactions: int
    avg_transaction_amount: int
    currency: str = 'IDR'
    refund_count: int
    refund_total: int


class RevenueTimeseriesPoint(BaseModel):
    """A single data point in revenue analytics timeseries."""

    period: str
    revenue: int
    transactions: int
    refunds: int


class ProviderRevenueStats(BaseModel):
    """Revenue statistics for a single payment provider."""

    transactions: int
    revenue: int
    success_rate: float


class RevenueAnalyticsResponse(BaseModel):
    """Response for GET /api/v1/admin/analytics/revenue."""

    summary: RevenueAnalyticsSummary
    timeseries: list[RevenueTimeseriesPoint]
    by_provider: dict[str, ProviderRevenueStats] = Field(default_factory=dict)


# --- Hardware ---

class CameraDeviceInfo(BaseModel):
    """Active camera device information."""

    index: int
    name: str
    path: str


class CameraStatusDetail(BaseModel):
    """Detailed camera status."""

    streaming: bool = False
    last_capture_at: datetime | None = None
    errors: list[str] = Field(default_factory=list)


class ActiveCameraStatus(BaseModel):
    """Camera hardware status for admin dashboard."""

    connected: bool
    active_device: CameraDeviceInfo | None = None
    status: CameraStatusDetail


class PrinterDeviceInfo(BaseModel):
    """Connected printer device information."""

    vendor: str
    model: str
    usb_path: str
    vendor_id: str = ''
    product_id: str = ''


class PrinterStatusDetail(BaseModel):
    """Detailed printer status."""

    paper_ok: bool
    printer_online: bool
    last_print_at: datetime | None = None
    total_prints_today: int = 0
    errors: list[str] = Field(default_factory=list)


class PrinterHardwareStatus(BaseModel):
    """Printer hardware status for admin dashboard."""

    connected: bool
    device: PrinterDeviceInfo | None = None
    status: PrinterStatusDetail


class SystemResources(BaseModel):
    """System resource usage."""

    cpu_usage_percent: float
    memory_usage_mb: float
    disk_usage_percent: float
    uptime_seconds: float


class HardwareStatusResponse(BaseModel):
    """Response for GET /api/v1/admin/hardware/status."""

    camera: ActiveCameraStatus
    printer: PrinterHardwareStatus
    system: SystemResources
