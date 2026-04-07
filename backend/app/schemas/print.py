"""Pydantic schemas for print API endpoints.

Covers print job initiation, status, and test print responses.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class PrintJobRequest(BaseModel):
    """Request body for POST /api/v1/kiosk/session/{id}/print."""

    include_photo: bool = Field(
        default=True,
        description='Whether to include the dithered photo on the receipt',
    )


class PrinterInfo(BaseModel):
    """Thermal printer hardware information."""

    vendor: str
    model: str
    vendor_id: str
    product_id: str


class PrintHardwareStatus(BaseModel):
    """Hardware-level printer status checks."""

    paper_ok: bool
    printer_online: bool
    errors: list[str] = Field(default_factory=list)


class PrintTestResponse(BaseModel):
    """Response for POST /api/v1/print/test."""

    success: bool
    message: str
    printer_info: PrinterInfo | None = None


class PrintStatusResponse(BaseModel):
    """Response for GET /api/v1/print/status."""

    connected: bool
    printer: PrinterInfo | None = None
    status: PrintHardwareStatus | None = None
    last_print_at: datetime | None = None
    total_prints_today: int = 0
