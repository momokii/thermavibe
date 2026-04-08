"""Thermal printer service — ESC/POS USB direct communication.

Uses python-escpos for ESC/POS USB communication with thermal printers.
Supports dithered image printing, text formatting, and test prints.
"""

from __future__ import annotations

import io
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


def _get_printer():
    """Get or initialize the ESC/POS printer connection.

    Returns:
        escpos printer instance.

    Raises:
        PrinterOfflineError: If the printer cannot be found.
    """
    global _printer

    if _printer is not None:
        try:
            # Verify connection is still valid
            _printer.is_online()
            return _printer
        except Exception:
            _printer = None

    try:
        from escpos.printer import Usb

        vendor_id = int(settings.printer_vendor_id, 16)
        product_id = int(settings.printer_product_id, 16)

        _printer = Usb(vendor_id, product_id)
        return _printer
    except Exception as exc:
        logger.warning('printer_not_found', error=str(exc))
        raise PrinterOfflineError() from exc


def get_printer_status() -> PrintStatusResponse:
    """Get the current printer status.

    Returns:
        PrintStatusResponse with connection and hardware status.
    """
    try:
        printer = _get_printer()
        return PrintStatusResponse(
            connected=True,
            printer=PrinterInfo(
                vendor='USB',
                model=f'VID:{settings.printer_vendor_id} PID:{settings.printer_product_id}',
                vendor_id=settings.printer_vendor_id,
                product_id=settings.printer_product_id,
            ),
            status=PrintHardwareStatus(
                paper_ok=True,
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
        printer.text(f'Printer: {settings.printer_vendor_id}:{settings.printer_product_id}\n')
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
                model=f'VID:{settings.printer_vendor_id} PID:{settings.printer_product_id}',
                vendor_id=settings.printer_vendor_id,
                product_id=settings.printer_product_id,
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
    """Print a vibe reading receipt with optional dithered photo.

    Args:
        ai_text: The AI-generated vibe reading text.
        photo_bytes: Optional JPEG photo bytes.
        include_photo: Whether to include the dithered photo.

    Returns:
        Dict with success status and message.

    Raises:
        PrinterError: If printing fails.
        PrinterOfflineError: If printer is not connected.
    """
    global _last_print_at, _total_prints_today

    printer = _get_printer()

    try:
        # Print header
        printer.set(align='center', bold=True, height=2)
        printer.text('Your Vibe Reading\n')
        printer.set(align='center', bold=False, height=1)
        printer.text('-' * 32 + '\n\n')

        # Print dithered photo if available
        if include_photo and photo_bytes:
            try:
                dithered = _dither_image(photo_bytes, width=settings.printer_paper_width)
                printer.image(dithered, impl='bitImageRaster')
                printer.text('\n')
            except Exception as exc:
                logger.warning('photo_print_failed', error=str(exc))

        # Print AI text wrapped for paper width
        printer.set(align='left', bold=False, height=1)
        wrapped_text = _wrap_text(ai_text, chars_per_line=32)
        printer.text(wrapped_text)
        printer.text('\n\n')

        # Footer
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

    Args:
        image_bytes: Raw JPEG/PNG image bytes.
        width: Target width in dots (matches paper width).

    Returns:
        Dithered PIL Image in 1-bit mode.
    """
    img = Image.open(io.BytesIO(image_bytes))

    # Convert to grayscale
    img = img.convert('L')

    # Calculate height maintaining aspect ratio
    aspect = img.height / img.width
    new_height = int(width * aspect)
    img = img.resize((width, new_height), Image.Resampling.LANCZOS)

    # Apply Floyd-Steinberg dithering
    img = img.convert('1', method=Image.Dither.FLOYDSTEINBERG)

    return img


def _wrap_text(text: str, chars_per_line: int = 32) -> str:
    """Wrap text to fit thermal paper width.

    Args:
        text: Text to wrap.
        chars_per_line: Maximum characters per line.

    Returns:
        Wrapped text string.
    """
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
