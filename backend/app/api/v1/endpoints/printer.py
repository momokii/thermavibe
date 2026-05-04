"""Thermal printer API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_admin
from app.schemas.print import PrintStatusResponse, PrintTestResponse
from app.services.printer_service import (
    discover_usb_printers,
    get_printer_status,
    print_test_page,
    select_printer,
)

router = APIRouter()


class UsbPrinterDevice(BaseModel):
    """A detected USB printer device."""

    vendor_id: str
    product_id: str
    description: str


class PrinterListResponse(BaseModel):
    """Response for GET /api/v1/printer/devices."""

    devices: list[UsbPrinterDevice]


class PrinterSelectRequest(BaseModel):
    """Request body for POST /api/v1/printer/select."""

    vendor_id: str
    product_id: str


@router.post('/select', response_model=PrintStatusResponse)
async def select_printer_endpoint(
    body: PrinterSelectRequest,
    _admin: dict = Depends(get_current_admin),
) -> PrintStatusResponse:
    """Set the active USB printer by vendor/product ID. Requires admin auth."""
    return select_printer(vendor_id=body.vendor_id, product_id=body.product_id)


@router.post('/test', response_model=PrintTestResponse)
async def test_print(
    _admin: dict = Depends(get_current_admin),
) -> PrintTestResponse:
    """Print a test page to verify printer connectivity. Requires admin auth."""
    return print_test_page()


@router.get('/status', response_model=PrintStatusResponse)
async def printer_status(
    _admin: dict = Depends(get_current_admin),
) -> PrintStatusResponse:
    """Check printer connection and hardware status. Requires admin auth."""
    return get_printer_status()


@router.get('/devices', response_model=PrinterListResponse)
async def list_printers(
    _admin: dict = Depends(get_current_admin),
) -> PrinterListResponse:
    """List detected USB thermal printer devices via pyusb.

    Scans all USB devices and identifies thermal printer candidates using
    USB class codes, known vendor IDs, and keyword matching.
    Requires admin auth.
    """
    discovered = discover_usb_printers()
    devices = [
        UsbPrinterDevice(
            vendor_id=d.vendor_id,
            product_id=d.product_id,
            description=f'{d.vendor_name} {d.product_name}'.strip(),
        )
        for d in discovered
    ]
    return PrinterListResponse(devices=devices)
