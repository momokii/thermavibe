"""Thermal printer service — ESC/POS USB direct communication.

Uses python-escpos for ESC/POS USB communication with thermal printers.
Auto-discovers connected printers on startup and supports hot-plug detection.
"""

from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass
from datetime import datetime, timezone

import structlog
from PIL import Image

from app.core.config import settings
from app.core.exceptions import PrinterError, PrinterOfflineError
from app.schemas.print import (
    PrintHardwareStatus,
    PrinterInfo,
    PrintStatusResponse,
    PrintTestResponse,
)

logger = structlog.get_logger(__name__)

# Module-level printer connection state
_printer = None
_last_print_at: datetime | None = None
_total_prints_today: int = 0

# Dynamic printer IDs — override settings when changed via admin UI.
_active_vendor_id: str = settings.printer_vendor_id
_active_product_id: str = settings.printer_product_id

# USB device class code for printers
USB_CLASS_PRINTER = 0x07

# Known ESC/POS thermal printer vendor IDs and their chip types
THERMAL_PRINTER_VENDORS: dict[str, dict[str, str]] = {
    '04b8': {'name': 'Epson', 'type': 'native'},
    '0483': {'name': 'SII/Custom', 'type': 'native'},
    '0a43': {'name': 'Posiflex', 'type': 'native'},
    '0dd4': {'name': 'Bixolon', 'type': 'native'},
    '154f': {'name': 'Xprinter', 'type': 'native'},
    '0493': {'name': 'Zebra', 'type': 'native'},
    '0c26': {'name': 'Star Micronics', 'type': 'native'},
    '067b': {'name': 'Prolific', 'type': 'usb_serial'},
    '1a86': {'name': 'CH340', 'type': 'usb_serial'},
    '0fe6': {'name': 'ICS Advent', 'type': 'usb_parallel'},
    '0416': {'name': 'WINBOND', 'type': 'usb_parallel'},
    '9710': {'name': 'MosChip', 'type': 'usb_parallel'},
}

# Keywords in USB manufacturer/product strings that indicate a printer
_PRINTER_KEYWORDS = ('printer', 'pos', 'thermal', 'receipt', 'escpos', 'print')


@dataclass
class DiscoveredPrinter:
    """A discovered USB printer candidate."""

    vendor_id: str
    product_id: str
    vendor_name: str
    product_name: str
    chip_type: str
    usb_class: int
    confidence: str  # "high" (class match), "medium" (vendor match), "low" (keyword match)


def discover_usb_printers() -> list[DiscoveredPrinter]:
    """Scan all USB devices and return candidates that look like thermal printers.

    Detection strategy (in priority order):
    1. USB class 7 (printer class) devices
    2. Devices with VID in THERMAL_PRINTER_VENDORS
    3. Devices whose manufacturer/product string contains printer keywords

    Returns:
        List of DiscoveredPrinter instances with connection details.
    """
    import usb.core

    candidates: list[DiscoveredPrinter] = []
    seen: set[tuple[int, int]] = set()

    try:
        devices = usb.core.find(find_all=True)
    except Exception as exc:
        logger.warning('usb_scan_failed', error=str(exc))
        return []

    for dev in devices:
        vid_pid = (dev.idVendor, dev.idProduct)
        if vid_pid in seen:
            continue
        seen.add(vid_pid)

        vid_hex = f'0x{dev.idVendor:04x}'
        pid_hex = f'0x{dev.idProduct:04x}'
        vid_str = f'{dev.idVendor:04x}'

        # Get manufacturer/product strings
        manufacturer = ''
        product_name = ''
        try:
            manufacturer = dev.manufacturer or ''
        except Exception:
            pass
        try:
            product_name = dev.product or ''
        except Exception:
            pass

        # Tier 1: USB printer class
        if dev.bDeviceClass == USB_CLASS_PRINTER:
            candidates.append(DiscoveredPrinter(
                vendor_id=vid_hex,
                product_id=pid_hex,
                vendor_name=manufacturer or 'Unknown',
                product_name=product_name or 'USB Printer',
                chip_type='native',
                usb_class=dev.bDeviceClass,
                confidence='high',
            ))
            continue

        # Check interfaces for printer class (some printers use class at interface level)
        has_printer_interface = False
        try:
            for cfg in dev:
                for iface in cfg:
                    if iface.bInterfaceClass == USB_CLASS_PRINTER:
                        has_printer_interface = True
                        break
                if has_printer_interface:
                    break
        except Exception:
            pass

        if has_printer_interface:
            candidates.append(DiscoveredPrinter(
                vendor_id=vid_hex,
                product_id=pid_hex,
                vendor_name=manufacturer or 'Unknown',
                product_name=product_name or 'USB Printer',
                chip_type='native',
                usb_class=USB_CLASS_PRINTER,
                confidence='high',
            ))
            continue

        # Tier 2: Known vendor ID
        if vid_str in THERMAL_PRINTER_VENDORS:
            info = THERMAL_PRINTER_VENDORS[vid_str]
            candidates.append(DiscoveredPrinter(
                vendor_id=vid_hex,
                product_id=pid_hex,
                vendor_name=info['name'],
                product_name=product_name or f'{info["name"]} Device',
                chip_type=info['type'],
                usb_class=dev.bDeviceClass,
                confidence='medium',
            ))
            continue

        # Tier 3: Keyword match in manufacturer/product strings
        combined = f'{manufacturer} {product_name}'.lower()
        if any(kw in combined for kw in _PRINTER_KEYWORDS):
            candidates.append(DiscoveredPrinter(
                vendor_id=vid_hex,
                product_id=pid_hex,
                vendor_name=manufacturer or 'Unknown',
                product_name=product_name or 'USB Device',
                chip_type='unknown',
                usb_class=dev.bDeviceClass,
                confidence='low',
            ))

    return candidates


def auto_select_printer() -> PrintStatusResponse | None:
    """Discover printers and auto-select if exactly one is found.

    Returns:
        PrintStatusResponse if a printer was selected, None if no printers
        found or multiple found (admin must choose).
    """
    discovered = discover_usb_printers()

    if not discovered:
        logger.info('printer_auto_detect_none_found')
        return None

    # Prefer higher confidence matches
    discovered.sort(key=lambda d: {'high': 3, 'medium': 2, 'low': 1}[d.confidence], reverse=True)

    if len(discovered) == 1:
        candidate = discovered[0]
        logger.info(
            'printer_auto_selecting',
            vendor_id=candidate.vendor_id,
            product_id=candidate.product_id,
            name=candidate.vendor_name,
            chip_type=candidate.chip_type,
        )
        return select_printer(candidate.vendor_id, candidate.product_id)

    # Multiple candidates — log them, don't auto-select
    logger.info(
        'printer_auto_detect_multiple',
        count=len(discovered),
        printers=[f'{d.vendor_name} {d.vendor_id}:{d.product_id}' for d in discovered],
    )
    return None


def _connect_usb_printer(vendor_id: int, product_id: int):
    """Create a python-escpos Usb printer, detaching kernel drivers if needed.

    Some USB printer chips (0fe6, 067b, etc.) get claimed by the kernel's
    usbfs driver, which blocks python-escpos's set_configuration() with
    "Resource busy". We reset the device to clear the kernel claim, then
    let Usb() open it fresh.
    """
    import time

    import usb.core
    import usb.util

    from escpos.printer import Usb

    dev = usb.core.find(idVendor=vendor_id, idProduct=product_id)
    if dev is None:
        raise PrinterOfflineError()

    # Detach kernel driver (usblp / CUPS) from all interfaces
    try:
        for cfg in dev:
            for iface in cfg:
                if dev.is_kernel_driver_active(iface.bInterfaceNumber):
                    try:
                        dev.detach_kernel_driver(iface.bInterfaceNumber)
                    except Exception:
                        pass
    except Exception:
        pass

    # Reset the device to clear usbfs claims at the kernel level.
    # Without this, set_configuration() inside Usb() gets "Resource busy".
    try:
        dev.reset()
    except Exception:
        pass

    # Wait for the device to re-enumerate after reset.
    # Usb() will do its own usb.core.find() internally.
    time.sleep(1.0)

    return Usb(vendor_id, product_id)


def _get_printer():
    """Get or initialize the ESC/POS printer connection.

    Attempts reconnection if the current printer is disconnected,
    falling back to auto-discovery if needed.

    Returns:
        escpos printer instance.

    Raises:
        PrinterOfflineError: If the printer cannot be found.
    """
    global _printer

    if _printer is not None:
        try:
            _printer.is_online()
            return _printer
        except Exception:
            logger.info('printer_connection_lost_reconnecting')
            _printer = None

    # Try to reconnect with current IDs first
    if _active_vendor_id and _active_product_id:
        try:
            vendor_id = int(_active_vendor_id, 16)
            product_id = int(_active_product_id, 16)
            _printer = _connect_usb_printer(vendor_id, product_id)
            logger.info('printer_reconnected', vid=_active_vendor_id, pid=_active_product_id)
            return _printer
        except Exception:
            pass

    # If reconnect fails, try auto-discovery
    if settings.printer_auto_detect:
        result = auto_select_printer()
        if result and result.connected:
            return _printer

    raise PrinterOfflineError()


def get_printer_status() -> PrintStatusResponse:
    """Get the current printer status.

    Returns:
        PrintStatusResponse with connection and hardware status.
    """
    try:
        printer = _get_printer()

        # Try real paper status query
        paper_ok = True
        try:
            status = printer.paper_status()
            paper_ok = status != 0
        except Exception:
            pass

        return PrintStatusResponse(
            connected=True,
            printer=PrinterInfo(
                vendor='USB',
                model=f'VID:{_active_vendor_id} PID:{_active_product_id}',
                vendor_id=_active_vendor_id,
                product_id=_active_product_id,
            ),
            status=PrintHardwareStatus(
                paper_ok=paper_ok,
                printer_online=True,
            ),
            last_print_at=_last_print_at,
            total_prints_today=_total_prints_today,
        )
    except PrinterOfflineError:
        return PrintStatusResponse(
            connected=False,
            printer=None,
            status=PrintHardwareStatus(
                paper_ok=False,
                printer_online=False,
                errors=['Printer not connected or not found'],
            ),
            last_print_at=_last_print_at,
            total_prints_today=_total_prints_today,
        )


def select_printer(vendor_id: str, product_id: str) -> PrintStatusResponse:
    """Set the active USB printer by vendor/product ID.

    Tears down any existing printer connection and updates the module-level
    IDs so the next _get_printer() call opens the new device.

    Args:
        vendor_id: USB vendor ID hex string (e.g. "0x04b8").
        product_id: USB product ID hex string (e.g. "0x0e15").

    Returns:
        PrintStatusResponse after attempting connection.
    """
    global _printer, _active_vendor_id, _active_product_id

    # Tear down existing connection
    if _printer is not None:
        try:
            _printer.close()
        except Exception:
            pass
        _printer = None

    _active_vendor_id = vendor_id
    _active_product_id = product_id

    logger.info('printer_selected', vendor_id=vendor_id, product_id=product_id)

    # Attempt connection and return status
    return get_printer_status()


def print_test_page() -> PrintTestResponse:
    """Print a test page to verify printer connectivity.

    Returns:
        PrintTestResponse indicating success or failure.
    """
    global _last_print_at, _total_prints_today

    try:
        printer = _get_printer()

        printer.set(align='center', bold=True, height=2)
        printer.text('VibePrint OS\n')
        printer.set(align='center', bold=False, height=1)
        printer.text('Test Print\n')
        printer.text('-' * 32 + '\n')
        printer.text(f'Printer: {_active_vendor_id}:{_active_product_id}\n')
        printer.text(f'Paper Width: {settings.printer_paper_width} dots\n')
        printer.text(f'Time: {datetime.now(timezone.utc).isoformat()}\n')
        printer.text('-' * 32 + '\n')
        printer.text('Print test successful!\n\n')
        printer.cut()

        _last_print_at = datetime.now(timezone.utc)
        _total_prints_today += 1

        logger.info('test_print_success')

        return PrintTestResponse(
            success=True,
            message='Test print sent successfully',
            printer_info=PrinterInfo(
                vendor='USB',
                model=f'VID:{_active_vendor_id} PID:{_active_product_id}',
                vendor_id=_active_vendor_id,
                product_id=_active_product_id,
            ),
        )
    except PrinterOfflineError:
        return PrintTestResponse(
            success=False,
            message='Printer is offline or not connected',
        )
    except Exception as exc:
        logger.exception('test_print_failed', error=str(exc))
        raise PrinterError(f'Test print failed: {exc}') from exc


def print_receipt(
    ai_text: str,
    photo_bytes: bytes | None = None,
    include_photo: bool = True,
) -> dict:
    """Print a vibe reading receipt with optional dithered photo."""
    global _last_print_at, _total_prints_today

    printer = _get_printer()

    try:
        printer.set(align='center', bold=True, height=2)
        printer.text('Your Vibe Reading\n')
        printer.set(align='center', bold=False, height=1)
        printer.text('-' * 32 + '\n\n')

        if include_photo and photo_bytes:
            try:
                dithered = _dither_image(photo_bytes, width=settings.printer_paper_width)
                printer.image(dithered, impl='bitImageRaster')
                printer.text('\n')
            except Exception as exc:
                logger.warning('photo_print_failed', error=str(exc))

        printer.set(align='left', bold=False, height=1)
        wrapped_text = _wrap_text(ai_text, chars_per_line=32)
        printer.text(wrapped_text)
        printer.text('\n\n')

        printer.set(align='center', bold=False, height=1)
        printer.text('-' * 32 + '\n')
        printer.text('VibePrint OS\n')
        printer.text(f'{datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")}\n')
        printer.cut()

        _last_print_at = datetime.now(timezone.utc)
        _total_prints_today += 1

        logger.info('receipt_printed')

        return {'success': True, 'message': 'Receipt printed successfully'}
    except Exception as exc:
        logger.exception('receipt_print_failed', error=str(exc))
        raise PrinterError(f'Receipt print failed: {exc}') from exc


def _dither_image(image_bytes: bytes, width: int = 384) -> Image.Image:
    """Convert a color image to a dithered black-and-white image.

    Uses Floyd-Steinberg dithering for optimal thermal print quality.
    """
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert('L')
    aspect = img.height / img.width
    new_height = int(width * aspect)
    img = img.resize((width, new_height), Image.Resampling.LANCZOS)
    img = img.convert('1')
    return img


def _wrap_text(text: str, chars_per_line: int = 32) -> str:
    """Wrap text to fit thermal paper width."""
    words = text.split()
    lines: list[str] = []
    current_line = ''

    for word in words:
        if current_line and len(current_line) + 1 + len(word) > chars_per_line:
            lines.append(current_line)
            current_line = word
        else:
            current_line = f'{current_line} {word}'.strip()

    if current_line:
        lines.append(current_line)

    return '\n'.join(lines)


def print_photobooth_strip(composite_image_path: str) -> dict:
    """Print a photobooth strip using the thermal printer.

    Dithers and scales the composite image to paper width.
    """
    global _last_print_at, _total_prints_today

    printer = _get_printer()

    try:
        with open(composite_image_path, 'rb') as f:
            image_bytes = f.read()

        dithered = _dither_image(image_bytes, width=settings.printer_paper_width)
        printer.image(dithered, impl='bitImageRaster')
        printer.text('\n')
        printer.cut()

        _last_print_at = datetime.now(timezone.utc)
        _total_prints_today += 1

        logger.info('photobooth_strip_printed', path=composite_image_path)

        return {'success': True, 'message': 'Photobooth strip printed successfully'}
    except Exception as exc:
        logger.exception('photobooth_print_failed', error=str(exc))
        raise PrinterError(f'Photobooth strip print failed: {exc}') from exc


async def printer_hotplug_scan(interval_seconds: int = 30) -> None:
    """Periodically scan for newly connected printers.

    Only auto-selects if no printer is currently connected.
    Called from the FastAPI lifespan as an asyncio task.
    """
    global _printer

    while True:
        await asyncio.sleep(interval_seconds)

        # Only auto-discover if no printer currently connected
        if _printer is not None:
            try:
                _printer.is_online()
                continue
            except Exception:
                _printer = None
                logger.info('printer_hotplug_reconnecting')

        if not settings.printer_auto_detect:
            continue

        result = auto_select_printer()
        if result and result.connected:
            logger.info(
                'printer_hotplug_detected',
                vid=_active_vendor_id,
                pid=_active_product_id,
            )


# ---------------------------------------------------------------------------
# Auto-detect printer on module load
# ---------------------------------------------------------------------------
try:
    _auto_result = auto_select_printer()
    if _auto_result and _auto_result.connected:
        logger.info(
            'printer_auto_detected',
            vid=_active_vendor_id,
            pid=_active_product_id,
        )
    else:
        logger.info('printer_not_found_on_startup')
except Exception:
    logger.info('printer_auto_detect_skipped')
