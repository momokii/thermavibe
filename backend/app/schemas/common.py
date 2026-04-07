"""Shared Pydantic schemas for common patterns.

Provides error response, pagination, health check, and envelope schemas
used across all API endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar('T')


class ErrorResponse(BaseModel):
    """Standard error response envelope."""

    code: str = Field(..., description='Machine-readable error code')
    message: str = Field(..., description='Human-readable error description')
    request_id: str | None = Field(None, description='Correlation ID for tracing')


class ErrorEnvelope(BaseModel):
    """Error wrapped in an error object per API contract."""

    error: ErrorResponse


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response."""

    items: list[T]
    total: int = Field(..., description='Total number of items')
    page: int = Field(1, ge=1, description='Current page number (1-indexed)')
    per_page: int = Field(20, ge=1, le=100, description='Items per page')
    total_pages: int = Field(..., description='Total number of pages')


class HealthCheckResponse(BaseModel):
    """Health check endpoint response."""

    status: str = Field(..., description='Overall status: ok or degraded')
    version: str = Field(..., description='Application version')
    environment: str = Field(..., description='Runtime environment')
    uptime_seconds: float = Field(..., description='Seconds since application start')
    checks: dict[str, str] = Field(
        default_factory=dict,
        description='Status of individual subsystems',
    )


class SuccessMessage(BaseModel):
    """Simple success message response."""

    message: str
