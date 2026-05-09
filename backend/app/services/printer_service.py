"""Thermal printer service — ESC/POS USB direct communication.

Uses python-escpos for ESC/POS USB communication with thermal printers.
Auto-discovers connected printers on startup and supports hot-plug detection.
"""

from __future__ import annotations

import asyncio
import contextlib
import io
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import structlog
from PIL import Image

from app.core.config import settings
from app.core.exceptions import PrinterError, PrinterOfflineError
from app.schemas.print import (
    PrinterInfo,
    PrintHardwareStatus,
    PrintStatusResponse,
    PrintTestResponse,
)

logger = structlog.get_logger(__name__)

# Module-level printer connection state
_printer = None
_last_print_at: datetime | None = None
_total_prints_today: int = 0
_connecting: bool = False  # Guard against re-entrant connection attempts

# Dynamic printer IDs — override settings when changed via admin UI.
_active_vendor_id: str = settings.printer_vendor_id
_active_product_id: str = settings.printer_product_id

# USB device class code for printers
USB_CLASS_PRINTER = 0x07

class _SafeUsbPrinter:
    """Subclass of python-escpos Usb that skips the destructive dev.reset().

    python-escpos's ``Usb._configure_usb()`` calls ``self.device.reset()``
    after ``set_configuration()``.  That USB port reset causes
    USB-to-parallel/serial bridge chips (0fe6, 067b, 1a86, etc.) to
    re-enumerate, invalidating the handle.  Subsequent writes silently
    fail — the API returns success but no paper comes out.

    This subclass overrides ``_configure_usb()`` to skip the reset,
    keeping the handle valid while preserving all other python-escpos
    functionality.  It also detaches kernel drivers that may block
    ``set_configuration()`` after a device power cycle.
    """

    def __new__(cls, vendor_id: int, product_id: int):
        from escpos.printer import Usb as EscposUsb

        # Create a dynamic subclass that overrides open() to always do fresh device lookup
        class _NoResetUsb(EscposUsb):
            def open(self, timeout=0) -> None:
                """Open the printer by doing a fresh USB device lookup.

                This ensures that after a reset/power cycle, we find the device
                at its NEW bus/address, not the cached old one.
                """
                import usb.core
                import usb.util

                # Clear the cached device from __init__ — it's stale after power cycle
                if hasattr(self, 'device') and self.device is not None:
                    usb.util.dispose_resources(self.device)
                    self.device = None

                # Fresh device lookup every time — finds current bus/address
                dev = usb.core.find(idVendor=self.usb_args['idVendor'], idProduct=self.usb_args['idProduct'])
                if dev is None:
                    raise PrinterOfflineError('Printer device not found')

                # Detach kernel driver if claimed
                try:
                    if dev.is_kernel_driver_active(0):
                        dev.detach_kernel_driver(0)
                except (usb.core.USBError, NotImplementedError):
                    pass

                # Set configuration
                try:
                    dev.set_configuration()
                except usb.core.USBError:
                    pass  # Already configured

                # Get configuration and extract endpoints properly
                cfg = dev.get_active_configuration()
                intf = cfg[(0, 0)]

                # Find the correct endpoints by checking their direction
                self.in_ep = None
                self.out_ep = None
                for ep in intf:
                    # Check endpoint direction: bit 7 set = IN (device to host)
                    if usb.util.endpoint_direction(ep.bEndpointAddress) == usb.util.ENDPOINT_IN:
                        self.in_ep = ep.bEndpointAddress
                    else:
                        self.out_ep = ep.bEndpointAddress

                if self.out_ep is None:
                    raise PrinterError('Could not find output endpoint')

                # Claim interface using usb.util
                try:
                    usb.util.claim_interface(dev, 0)
                except usb.core.USBError:
                    # Interface already claimed - try to detach kernel driver
                    try:
                        if dev.is_kernel_driver_active(0):
                            dev.detach_kernel_driver(0)
                            usb.util.claim_interface(dev, 0)
                    except (usb.core.USBError, NotImplementedError):
                        pass

                self.device = dev
                self._usb_device = dev  # Store for python-escpos internals

            def _configure_usb(self) -> None:
                """Override to skip the destructive dev.reset()."""
                # Skip reset — breaks bridge chips
                pass

        # Create instance normally (it will cache device in __init__)
        return _NoResetUsb(vendor_id, product_id)


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


def _read_sysfs(path: str) -> str:
    try:
        with open(path) as f:
            return f.read().strip()
    except Exception:
        return ''


def _is_device_present() -> bool:
    """Check if the configured USB printer is physically connected via sysfs.

    Reads /sys/bus/usb/devices/ to find a device matching the active VID:PID.
    This avoids sending any USB commands (like is_online()) that can fail on
    USB-to-parallel/serial bridge chips and cause unnecessary reconnect cycles.
    """
    if not _active_vendor_id or not _active_product_id:
        return False

    import glob

    target_vid = _active_vendor_id.replace('0x', '')
    target_pid = _active_product_id.replace('0x', '')

    for dev_path in glob.glob('/sys/bus/usb/devices/*/idVendor'):
        vid_str = _read_sysfs(dev_path)
        if vid_str != target_vid:
            continue
        dev_dir = dev_path.rsplit('/', 1)[0]
        pid_str = _read_sysfs(f'{dev_dir}/idProduct')
        if pid_str == target_pid:
            return True

    return False


def discover_usb_printers() -> list[DiscoveredPrinter]:
    """Scan USB devices via sysfs (no USB handles opened).

    Uses /sys/bus/usb/devices/ to read vendor/product IDs without
    opening any USB handles. This avoids usbfs claims that block
    python-escpos from connecting, and works reliably for hot-plug
    detection in long-running processes.

    Detection strategy (in priority order):
    1. USB class 7 (printer class) devices
    2. Devices with VID in THERMAL_PRINTER_VENDORS
    3. Devices whose manufacturer/product string contains printer keywords

    Returns:
        List of DiscoveredPrinter instances with connection details.
    """
    import glob

    candidates: list[DiscoveredPrinter] = []
    seen: set[tuple[str, str]] = set()

    try:
        device_paths = glob.glob('/sys/bus/usb/devices/*/idVendor')
    except Exception:
        return []

    for dev_path in device_paths:
        vid_str = _read_sysfs(dev_path)
        if not vid_str:
            continue

        dev_dir = dev_path.rsplit('/', 1)[0]
        pid_str = _read_sysfs(f'{dev_dir}/idProduct')
        dev_class = _read_sysfs(f'{dev_dir}/bDeviceClass')
        manufacturer = _read_sysfs(f'{dev_dir}/manufacturer')
        product_name = _read_sysfs(f'{dev_dir}/product')

        vid_pid = (vid_str, pid_str)
        if vid_pid in seen:
            continue
        seen.add(vid_pid)

        vid_hex = f'0x{vid_str}'
        pid_hex = f'0x{pid_str}'

        # Skip hubs and host controllers
        if dev_class in ('09',):
            continue

        # Tier 1: USB printer class (at device or interface level)
        if dev_class == '07':
            candidates.append(DiscoveredPrinter(
                vendor_id=vid_hex,
                product_id=pid_hex,
                vendor_name=manufacturer or 'Unknown',
                product_name=product_name or 'USB Printer',
                chip_type='native',
                usb_class=0x07,
                confidence='high',
            ))
            continue

        # Check interface classes for printer class
        has_printer_interface = False
        for iface_path in glob.glob(f'{dev_dir}/*/bInterfaceClass'):
            iface_class = _read_sysfs(iface_path)
            if iface_class == '07':
                has_printer_interface = True
                break

        if has_printer_interface:
            candidates.append(DiscoveredPrinter(
                vendor_id=vid_hex,
                product_id=pid_hex,
                vendor_name=manufacturer or 'Unknown',
                product_name=product_name or 'USB Printer',
                chip_type='native',
                usb_class=0x07,
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
                usb_class=int(dev_class, 16) if dev_class else 0,
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
                usb_class=int(dev_class, 16) if dev_class else 0,
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


def _close_printer(printer) -> None:
    """Close a printer connection and release all USB resources."""
    with contextlib.suppress(Exception):
        printer.close()
    try:
        import usb.util

        raw_dev = getattr(printer, '_device', None)
        if raw_dev and raw_dev is not False and raw_dev is not None:
            usb.util.dispose_resources(raw_dev)
    except Exception:
        pass


def _is_printer_usable(printer) -> bool:
    """Check if a printer object has a valid open device handle.

    Verifies the USB device file still exists at the cached bus/address.
    After power cycle, the device re-enumerates with a new address, so
    the old address file disappears — this detects the stale handle.
    """
    import os

    raw_dev = getattr(printer, '_device', None)
    if raw_dev is None or raw_dev is False:
        logger.info('printer_usable_check', result=False, reason='device_is_none_or_false')
        return False
    try:
        dev_path = f'/dev/bus/usb/{raw_dev.bus:03d}/{raw_dev.address:03d}'
        exists = os.path.exists(dev_path)
        logger.info('printer_usable_check', result=exists, bus=raw_dev.bus, address=raw_dev.address, dev_path=dev_path)
        return exists
    except Exception as exc:
        logger.info('printer_usable_check', result=False, error=str(exc))
        return False


def _connect_usb_printer(vendor_id: int, product_id: int):
    """Create a USB printer connection with retry.

    Uses _SafeUsbPrinter which skips the destructive dev.reset() that
    python-escpos's Usb class performs.  Multiple attempts with
    progressively stronger USB cleanup between each try.
    """
    global _connecting

    if _connecting:
        raise PrinterOfflineError()
    _connecting = True

    try:
        return _connect_usb_printer_inner(vendor_id, product_id)
    finally:
        _connecting = False


def _dispose_all_for(vendor_id: int, product_id: int) -> None:
    """Find and dispose ALL pyusb resources for a given VID:PID.

    After power cycle, there may be multiple stale pyusb device objects
    from prior connections. This clears them all so the next find()
    returns a fresh handle.
    """
    import gc

    import usb.core
    import usb.util

    with contextlib.suppress(Exception):
        for dev in usb.core.find(find_all=True, idVendor=vendor_id, idProduct=product_id):
            usb.util.dispose_resources(dev)
    # Force garbage collection to ensure pyusb objects are freed
    gc.collect()


def _connect_usb_printer_inner(vendor_id: int, product_id: int):
    """Inner connection logic — called by _connect_usb_printer with guard.

    After power cycle, the USB device needs time to stabilize. The key is
    to wait longer between retries and avoid aggressive USB operations that
    can put the device in a worse state.
    """
    import time

    import usb.core
    import usb.util

    # Step 0: Dispose ALL stale pyusb resources for this VID:PID.
    # After power cycle, pyusb caches device objects that point to
    # gone /dev/bus/usb paths. Clearing them forces a fresh enumerate.
    _dispose_all_for(vendor_id, product_id)

    # After power cycle, the device needs significant time to re-enumerate and stabilize.
    # The USB-to-parallel bridge chip (0fe6:811e) is especially slow to recover.
    wait_times = [0, 3, 5, 8]  # Progressive wait times (0 for immediate first attempt)

    for attempt, wait_time in enumerate(wait_times, 1):
        # Wait before attempting connection (except first attempt)
        if attempt > 1:
            logger.info(f'connect_attempt_{attempt}_waiting', wait_seconds=wait_time)
            time.sleep(wait_time)

        # Dispose stale resources before each attempt
        _dispose_all_for(vendor_id, product_id)

        # Check if device is physically present via sysfs first
        if not _is_device_present():
            logger.info(f'connect_attempt_{attempt}_device_not_physically_present')
            continue

        # Try to create printer and open it - the open() method handles fresh device lookup
        try:
            printer = _SafeUsbPrinter(vendor_id, product_id)
            printer.open()

            # Verify the connection is actually usable
            if _is_printer_usable(printer):
                logger.info(f'connect_attempt_{attempt}_success')
                return printer
            else:
                logger.warning(f'connect_attempt_{attempt}_not_usable')
                _close_printer(printer)
        except Exception as exc:
            logger.warning(f'connect_attempt_{attempt}_failed', error=str(exc), error_type=type(exc).__name__)

    # All attempts failed
    logger.info('connect_all_attempts_failed')
    raise PrinterOfflineError()


def _reset_usb_port_sysfs(vid_hex: str, pid_hex: str) -> bool:
    """Reset USB port via sysfs authorized file.

    Forces a USB port reset at the host controller level without
    requiring any USB I/O. Works when the device firmware is stuck
    or the kernel has stale USB state.
    """
    import glob
    import os
    import time

    for dev_path in glob.glob('/sys/bus/usb/devices/*/idVendor'):
        if _read_sysfs(dev_path) != vid_hex:
            continue
        dev_dir = dev_path.rsplit('/', 1)[0]
        if _read_sysfs(f'{dev_dir}/idProduct') != pid_hex:
            continue

        authorized = f'{dev_dir}/authorized'
        if not os.path.exists(authorized):
            logger.info('sysfs_reset_no_authorized', dev_dir=dev_dir)
            continue

        try:
            logger.info('sysfs_reset_deauthorizing', dev_dir=dev_dir)
            with open(authorized, 'w') as f:
                f.write('0\n')
            time.sleep(1)
            logger.info('sysfs_reset_reauthorizing', dev_dir=dev_dir)
            with open(authorized, 'w') as f:
                f.write('1\n')
            return True
        except Exception as exc:
            logger.info('sysfs_reset_failed', dev_dir=dev_dir, error=str(exc))

    return False


def _get_printer():
    """Get or initialize the ESC/POS printer connection."""
    import time

    global _printer

    if _printer is not None:
        present = _is_device_present()
        usable = _is_printer_usable(_printer)
        logger.info('get_printer_cached_check', present=present, usable=usable)
        if present and usable:
            return _printer
        # Device physically gone or handle stale — close and reconnect
        logger.info('printer_connection_lost_reconnecting', present=present, usable=usable)
        _close_printer(_printer)
        _printer = None
        # Dispose stale pyusb resources for a clean reconnect
        if _active_vendor_id and _active_product_id:
            with contextlib.suppress(Exception):
                _dispose_all_for(int(_active_vendor_id, 16), int(_active_product_id, 16))

        # Power cycle detected: device present but handle not usable.
        # The USB-to-parallel bridge needs time to stabilize after power cycle.
        if present and not usable:
            logger.info('power_cycle_detected_waiting', wait_seconds=3)
            time.sleep(3)

    # Try to reconnect with current IDs
    if _active_vendor_id and _active_product_id:
        try:
            vendor_id = int(_active_vendor_id, 16)
            product_id = int(_active_product_id, 16)
            _printer = _connect_usb_printer(vendor_id, product_id)
            logger.info('printer_reconnected', vid=_active_vendor_id, pid=_active_product_id)
            return _printer
        except Exception:
            logger.info('printer_reconnect_failed', vid=_active_vendor_id, pid=_active_product_id)

    raise PrinterOfflineError()


def get_printer_status() -> PrintStatusResponse:
    """Get the current printer status.

    Returns:
        PrintStatusResponse with connection and hardware status.
    """
    global _printer

    try:
        _get_printer()

        return PrintStatusResponse(
            connected=True,
            printer=PrinterInfo(
                vendor='USB',
                model=f'VID:{_active_vendor_id} PID:{_active_product_id}',
                vendor_id=_active_vendor_id,
                product_id=_active_product_id,
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


def select_printer(vendor_id: str, product_id: str) -> PrintStatusResponse:
    """Set the active USB printer by vendor/product ID.

    Closes any existing connection and attempts to open a fresh USB
    connection to verify the printer is actually reachable.
    """
    global _printer, _active_vendor_id, _active_product_id

    if _printer is not None:
        _close_printer(_printer)
        _printer = None

    _active_vendor_id = vendor_id
    _active_product_id = product_id

    logger.info('printer_selected', vendor_id=vendor_id, product_id=product_id)

    # Actually try to connect — don't just check sysfs presence.
    # This ensures the status badge reflects real connectivity.
    try:
        int_vid = int(vendor_id, 16)
        int_pid = int(product_id, 16)
        _printer = _connect_usb_printer(int_vid, int_pid)
        connected = True
    except Exception:
        _printer = None
        connected = False

    return PrintStatusResponse(
        connected=connected,
        printer=PrinterInfo(
            vendor='USB',
            model=f'VID:{vendor_id} PID:{product_id}',
            vendor_id=vendor_id,
            product_id=product_id,
        ),
        status=PrintHardwareStatus(
            paper_ok=connected,
            printer_online=connected,
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

        # Diagnostic: log the printer's USB device info
        raw_dev = getattr(printer, '_device', None)
        if raw_dev and raw_dev is not False:
            logger.info('test_print_device_info', bus=raw_dev.bus, address=raw_dev.address, type=type(printer).__name__)
        else:
            logger.info('test_print_device_info', device='NONE')

        printer.set(align='center', bold=True, height=2)
        printer.text('VibePrint OS\n')
        printer.set(align='center', bold=False, height=1)
        printer.text('Test Print\n')
        printer.text('-' * 32 + '\n')
        printer.text(f'Printer: {_active_vendor_id}:{_active_product_id}\n')
        printer.text(f'Paper Width: {settings.printer_paper_width} dots\n')
        printer.text(f'Time: {datetime.now(UTC).isoformat()}\n')
        printer.text('-' * 32 + '\n')
        printer.text('Print test successful!\n\n')
        printer.cut()

        _last_print_at = datetime.now(UTC)
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


def _local_now(offset_hours: int) -> datetime:
    """Get current time adjusted by a UTC offset."""
    return datetime.now(UTC) + timedelta(hours=offset_hours)


def _print_footer(
    printer,
    footer_name: str = 'VibePrint OS',
    timezone_offset: int = 7,
    footer_enabled: bool = True,
    name_enabled: bool = True,
    timestamp_enabled: bool = True,
) -> None:
    """Print the standard footer (separator, brand name, timestamp)."""
    if not footer_enabled:
        return
    printer.set(align='center', bold=False, height=1)
    printer.text('-' * 32 + '\n')
    if name_enabled:
        printer.text(f'{footer_name}\n')
    if timestamp_enabled:
        printer.text(f'{_local_now(timezone_offset).strftime("%Y-%m-%d %H:%M")}\n')


def print_receipt(
    ai_text: str,
    photo_bytes: bytes | None = None,
    include_photo: bool = True,
    footer_name: str = 'VibePrint OS',
    timezone_offset: int = 7,
    footer_enabled: bool = True,
    name_enabled: bool = True,
    timestamp_enabled: bool = True,
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

        _print_footer(printer, footer_name, timezone_offset, footer_enabled, name_enabled, timestamp_enabled)
        printer.cut()

        _last_print_at = datetime.now(UTC)
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


def print_photobooth_strip(
    composite_image_path: str,
    footer_name: str = 'VibePrint OS',
    timezone_offset: int = 7,
    footer_enabled: bool = True,
    name_enabled: bool = True,
    timestamp_enabled: bool = True,
) -> dict:
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

        _print_footer(printer, footer_name, timezone_offset, footer_enabled, name_enabled, timestamp_enabled)
        printer.cut()

        _last_print_at = datetime.now(UTC)
        _total_prints_today += 1

        logger.info('photobooth_strip_printed', path=composite_image_path)

        return {'success': True, 'message': 'Photobooth strip printed successfully'}
    except Exception as exc:
        logger.exception('photobooth_print_failed', error=str(exc))
        raise PrinterError(f'Photobooth strip print failed: {exc}') from exc


def print_access_code(
    code: str,
    code_type: str = 'universal',
    max_uses: int = 1,
    price: int | None = None,
    expires_at: datetime | None = None,
    notes: str | None = None,
    footer_name: str = 'VibePrint OS',
    timezone_offset: int = 7,
    footer_enabled: bool = True,
    name_enabled: bool = True,
    timestamp_enabled: bool = True,
) -> dict:
    """Print an access code receipt card.

    Prints a thermal receipt with the access code prominently displayed,
    along with type, price, expiry, and usage information.
    """
    global _last_print_at, _total_prints_today

    printer = _get_printer()

    try:
        # Header
        printer.set(align='center', bold=True, height=2)
        printer.text('Access Code\n')
        printer.set(align='center', bold=False, height=1)
        printer.text('-' * 32 + '\n\n')

        # Code — large and centered
        printer.set(align='center', bold=True, height=2)
        printer.text(f'{code}\n\n')

        # Type
        printer.set(align='left', bold=False, height=1)
        type_label = {'vibe_check': 'Vibe Check', 'photobooth': 'Photobooth'}.get(code_type, 'Universal')
        printer.text(f'Type:      {type_label}\n')

        # Price
        if price is not None:
            printer.text(f'Price:     Rp {price:,}\n')
        else:
            printer.text('Price:     Free\n')

        # Max uses
        printer.text(f'Max Uses:  {max_uses}\n')

        # Expiry
        if expires_at:
            local_time = expires_at + timedelta(hours=timezone_offset)
            expiry_str = local_time.strftime('%Y-%m-%d %H:%M')
            printer.text(f'Expires:   {expiry_str}\n')
        else:
            printer.text('Expires:   Never\n')

        # Notes
        if notes:
            printer.text('\n')
            wrapped = _wrap_text(notes, chars_per_line=32)
            printer.text(wrapped)
            printer.text('\n')

        printer.text('\n')

        # Footer
        _print_footer(printer, footer_name, timezone_offset, footer_enabled, name_enabled, timestamp_enabled)
        printer.cut()

        _last_print_at = datetime.now(UTC)
        _total_prints_today += 1

        logger.info('access_code_printed', code=code)

        return {'success': True, 'message': 'Access code printed successfully'}
    except Exception as exc:
        logger.exception('access_code_print_failed', error=str(exc))
        raise PrinterError(f'Access code print failed: {exc}') from exc


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
            if _is_device_present() and _is_printer_usable(_printer):
                continue
            _close_printer(_printer)
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
