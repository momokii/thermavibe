"""Hardware status aggregation service.

Combines camera, printer, and system resource information
for the admin dashboard hardware status page.
"""

from __future__ import annotations

import os
import time

import structlog

from app.schemas.admin import (
    ActiveCameraStatus,
    CameraDeviceInfo,
    CameraStatusDetail,
    HardwareStatusResponse,
    PrinterDeviceInfo,
    PrinterHardwareStatus,
    PrinterStatusDetail,
    SystemResources,
)

logger = structlog.get_logger(__name__)

# Track app start time for uptime calculation
_start_time = time.monotonic()


def get_full_hardware_status() -> HardwareStatusResponse:
    """Get combined hardware status for the admin dashboard.

    Returns:
        HardwareStatusResponse with camera, printer, and system info.
    """
    camera_status = _get_camera_status()
    printer_status = _get_printer_status()
    system_status = _get_system_resources()

    return HardwareStatusResponse(
        camera=camera_status,
        printer=printer_status,
        system=system_status,
    )


def test_camera_capture() -> dict:
    """Test camera capture and return result.

    Returns:
        Dict with success status and message.
    """
    try:
        from app.services.camera_service import capture_frame

        # This is async but we provide a sync wrapper for convenience
        import asyncio

        frame_bytes = asyncio.get_event_loop().run_until_complete(capture_frame())
        return {
            'success': True,
            'message': f'Camera capture successful ({len(frame_bytes)} bytes)',
            'size_bytes': len(frame_bytes),
        }
    except Exception as exc:
        logger.warning('camera_test_failed', error=str(exc))
        return {
            'success': False,
            'message': f'Camera test failed: {exc}',
            'size_bytes': 0,
        }


def test_printer() -> dict:
    """Test printer connectivity and return result.

    Returns:
        Dict with success status and message.
    """
    try:
        from app.services.printer_service import print_test_page

        result = print_test_page()
        return {
            'success': result.success,
            'message': result.message,
        }
    except Exception as exc:
        logger.warning('printer_test_failed', error=str(exc))
        return {
            'success': False,
            'message': f'Printer test failed: {exc}',
        }


def _get_camera_status() -> ActiveCameraStatus:
    """Get camera hardware status."""
    try:
        from app.services.camera_service import get_active_camera

        active = get_active_camera()
        if active:
            return ActiveCameraStatus(
                connected=True,
                active_device=CameraDeviceInfo(
                    index=active.index,
                    name=active.name,
                    path=active.path,
                ),
                status=CameraStatusDetail(streaming=False),
            )
    except Exception as exc:
        logger.debug('camera_status_check_failed', error=str(exc))

    return ActiveCameraStatus(
        connected=False,
        active_device=None,
        status=CameraStatusDetail(errors=['No camera device detected']),
    )


def _get_printer_status() -> PrinterHardwareStatus:
    """Get printer hardware status."""
    try:
        from app.services.printer_service import get_printer_status

        status = get_printer_status()
        if status.connected and status.printer:
            return PrinterHardwareStatus(
                connected=True,
                device=PrinterDeviceInfo(
                    vendor=status.printer.vendor,
                    model=status.printer.model,
                    usb_path=f'USB VID:{status.printer.vendor_id} PID:{status.printer.product_id}',
                    vendor_id=status.printer.vendor_id,
                    product_id=status.printer.product_id,
                ),
                status=PrinterStatusDetail(
                    paper_ok=status.status.paper_ok if status.status else False,
                    printer_online=status.status.printer_online if status.status else False,
                    last_print_at=status.last_print_at,
                    total_prints_today=status.total_prints_today,
                ),
            )
    except Exception as exc:
        logger.debug('printer_status_check_failed', error=str(exc))

    return PrinterHardwareStatus(
        connected=False,
        device=None,
        status=PrinterStatusDetail(
            paper_ok=False,
            printer_online=False,
            errors=['Printer not connected'],
        ),
    )


def _get_system_resources() -> SystemResources:
    """Get system resource usage."""
    try:
        uptime = time.monotonic() - _start_time

        # CPU usage (load average as rough proxy on Linux)
        cpu_usage = 0.0
        if hasattr(os, 'getloadavg'):
            load = os.getloadavg()
            cpu_usage = min(load[0] * 100, 100.0)

        # Memory usage
        memory_mb = 0.0
        try:
            with open('/proc/meminfo') as f:
                meminfo = {}
                for line in f:
                    parts = line.split()
                    if len(parts) >= 2:
                        key = parts[0].rstrip(':')
                        value = int(parts[1])
                        meminfo[key] = value
                total = meminfo.get('MemTotal', 0)
                available = meminfo.get('MemAvailable', 0)
                used = total - available
                memory_mb = round(used / 1024, 1)
                cpu_usage = cpu_usage  # Already calculated above
        except (FileNotFoundError, PermissionError):
            pass

        # Disk usage
        disk_usage = 0.0
        try:
            stat = os.statvfs('/')
            total_space = stat.f_blocks * stat.f_frsize
            free_space = stat.f_bavail * stat.f_frsize
            used_space = total_space - free_space
            disk_usage = round((used_space / total_space) * 100, 1) if total_space > 0 else 0.0
        except Exception:
            pass

        return SystemResources(
            cpu_usage_percent=round(cpu_usage, 1),
            memory_usage_mb=memory_mb,
            disk_usage_percent=disk_usage,
            uptime_seconds=round(uptime, 1),
        )
    except Exception as exc:
        logger.debug('system_resources_check_failed', error=str(exc))
        return SystemResources(
            cpu_usage_percent=0.0,
            memory_usage_mb=0.0,
            disk_usage_percent=0.0,
            uptime_seconds=0.0,
        )
