"""Thermal printer API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_admin
from app.schemas.print import PrintStatusResponse, PrintTestResponse
from app.services.printer_service import get_printer_status, print_test_page

router = APIRouter()


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
