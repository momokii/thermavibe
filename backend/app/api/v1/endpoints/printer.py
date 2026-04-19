"""Thermal printer API endpoints."""

from __future__ import annotations

import subprocess

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_admin
from app.schemas.print import PrintStatusResponse, PrintTestResponse
from app.services.printer_service import get_printer_status, print_test_page, select_printer

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
    """List detected USB printer devices via lsusb.

    Scans for known ESC/POS printer vendor IDs and returns matching devices.
    Requires admin auth.
    """
    # Known ESC/POS printer vendor IDs (hex)
    known_vendors = {
        '04b8': 'Epson',
        '0483': 'SII/Custom',
        '0a43': 'Custom',
        '0dd4': 'Bixolon',
        '0a43': 'Posiflex',
        '154f': 'Xprinter',
        '0493': 'Zebra',
        '0c26': 'Star Micronics',
        '067b': 'Prolific (USB-Serial)',
        '1a86': 'CH340 (USB-Serial)',
    }

    devices: list[UsbPrinterDevice] = []

    try:
        result = subprocess.run(
            ['lsusb'],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                # lsusb format: "Bus 001 Device 002: ID 04b8:0202 Seiko Epson Corp."
                if 'ID' not in line:
                    continue
                try:
                    id_part = line.split('ID')[1].strip().split()[0]
                    vid, pid = id_part.split(':')
                    vendor_name = known_vendors.get(vid.lower(), '')
                    desc = line.split('ID')[1].strip().split(' ', 1)[1] if len(line.split('ID')[1].strip().split(' ', 1)) > 1 else vid
                    # Include all USB devices so admin can pick their printer
                    devices.append(UsbPrinterDevice(
                        vendor_id=f'0x{vid}',
                        product_id=f'0x{pid}',
                        description=f'{vendor_name} {desc}'.strip() if vendor_name else desc,
                    ))
                except (IndexError, ValueError):
                    continue
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return PrinterListResponse(devices=devices)
