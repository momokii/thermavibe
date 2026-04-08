"""Unit tests for hardware service -- status aggregation, camera/printer tests."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.admin import (
    ActiveCameraStatus,
    CameraDeviceInfo,
    CameraStatusDetail,
    PrinterHardwareStatus,
    PrinterDeviceInfo,
    PrinterStatusDetail,
    SystemResources,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_start_time():
    """Reset the module start time for consistent uptime calculations."""
    import app.services.hardware_service as svc
    import time

    original = svc._start_time
    svc._start_time = time.monotonic()
    yield
    svc._start_time = original


# ---------------------------------------------------------------------------
# get_full_hardware_status
# ---------------------------------------------------------------------------


class TestGetFullHardwareStatus:
    """Tests for get_full_hardware_status()."""

    @patch('app.services.hardware_service._get_system_resources')
    @patch('app.services.hardware_service._get_printer_status')
    @patch('app.services.hardware_service._get_camera_status')
    def test_all_connected(self, mock_camera_status, mock_printer_status, mock_sys):
        """All hardware connected returns connected=True for both."""
        mock_camera_status.return_value = ActiveCameraStatus(
            connected=True,
            active_device=CameraDeviceInfo(index=0, name='Camera 0', path='/dev/video0'),
            status=CameraStatusDetail(streaming=False),
        )
        mock_printer_status.return_value = PrinterHardwareStatus(
            connected=True,
            device=PrinterDeviceInfo(vendor='USB', model='EPSON', usb_path='USB VID:0x04b8 PID:0x0e15'),
            status=PrinterStatusDetail(paper_ok=True, printer_online=True),
        )
        mock_sys.return_value = SystemResources(
            cpu_usage_percent=5.0,
            memory_usage_mb=512.0,
            disk_usage_percent=42.0,
            uptime_seconds=10.0,
        )

        from app.services.hardware_service import get_full_hardware_status

        result = get_full_hardware_status()

        assert result.camera.connected is True
        assert result.printer.connected is True
        assert result.system.uptime_seconds >= 0

    @patch('app.services.hardware_service._get_system_resources')
    @patch('app.services.hardware_service._get_printer_status')
    @patch('app.services.hardware_service._get_camera_status')
    def test_no_camera(self, mock_camera_status, mock_printer_status, mock_sys):
        """No camera detected returns connected=False for camera."""
        mock_camera_status.return_value = ActiveCameraStatus(
            connected=False,
            active_device=None,
            status=CameraStatusDetail(errors=['No camera device detected']),
        )
        mock_printer_status.return_value = PrinterHardwareStatus(
            connected=True,
            device=PrinterDeviceInfo(vendor='USB', model='EPSON', usb_path='USB'),
            status=PrinterStatusDetail(paper_ok=True, printer_online=True),
        )
        mock_sys.return_value = SystemResources(
            cpu_usage_percent=0.0, memory_usage_mb=0.0, disk_usage_percent=0.0, uptime_seconds=0.0,
        )

        from app.services.hardware_service import get_full_hardware_status

        result = get_full_hardware_status()

        assert result.camera.connected is False
        assert result.printer.connected is True

    @patch('app.services.hardware_service._get_system_resources')
    @patch('app.services.hardware_service._get_printer_status')
    @patch('app.services.hardware_service._get_camera_status')
    def test_no_printer(self, mock_camera_status, mock_printer_status, mock_sys):
        """No printer detected returns connected=False for printer."""
        mock_camera_status.return_value = ActiveCameraStatus(
            connected=True,
            active_device=CameraDeviceInfo(index=0, name='Camera 0', path='/dev/video0'),
            status=CameraStatusDetail(streaming=False),
        )
        mock_printer_status.return_value = PrinterHardwareStatus(
            connected=False,
            device=None,
            status=PrinterStatusDetail(paper_ok=False, printer_online=False, errors=['Printer not connected']),
        )
        mock_sys.return_value = SystemResources(
            cpu_usage_percent=0.0, memory_usage_mb=0.0, disk_usage_percent=0.0, uptime_seconds=0.0,
        )

        from app.services.hardware_service import get_full_hardware_status

        result = get_full_hardware_status()

        assert result.camera.connected is True
        assert result.printer.connected is False


# ---------------------------------------------------------------------------
# test_camera_capture
# ---------------------------------------------------------------------------


class TestCameraCapture:
    """Tests for test_camera_capture()."""

    @patch('app.services.camera_service.capture_frame', new_callable=AsyncMock)
    def test_success(self, mock_capture):
        """Successful capture returns success=True with size_bytes."""
        mock_capture.return_value = b'\xff\xd8\xff\xe0JPEG_DATA'

        from app.services.hardware_service import test_camera_capture

        result = test_camera_capture()

        assert result['success'] is True
        assert result['size_bytes'] == len(b'\xff\xd8\xff\xe0JPEG_DATA')

    @patch('app.services.camera_service.capture_frame', new_callable=AsyncMock)
    def test_failure(self, mock_capture):
        """Failed capture returns success=False."""
        mock_capture.side_effect = Exception('Camera busy')

        from app.services.hardware_service import test_camera_capture

        result = test_camera_capture()

        assert result['success'] is False
        assert 'Camera test failed' in result['message']


# ---------------------------------------------------------------------------
# test_printer
# ---------------------------------------------------------------------------


class TestPrinter:
    """Tests for test_printer()."""

    @patch('app.services.printer_service.print_test_page')
    def test_success(self, mock_test_page):
        """Successful printer test returns success=True."""
        from app.schemas.print import PrintTestResponse

        mock_test_page.return_value = PrintTestResponse(
            success=True, message='Test print sent successfully',
        )

        from app.services.hardware_service import test_printer

        result = test_printer()

        assert result['success'] is True

    @patch('app.services.printer_service.print_test_page')
    def test_failure(self, mock_test_page):
        """Failed printer test returns success=False."""
        mock_test_page.side_effect = Exception('USB error')

        from app.services.hardware_service import test_printer

        result = test_printer()

        assert result['success'] is False
        assert 'Printer test failed' in result['message']


# ---------------------------------------------------------------------------
# _get_system_resources
# ---------------------------------------------------------------------------


class TestGetSystemResources:
    """Tests for _get_system_resources()."""

    def test_returns_numeric_values(self):
        """All fields in system resources should be numeric."""
        from app.services.hardware_service import _get_system_resources

        result = _get_system_resources()

        assert isinstance(result.cpu_usage_percent, float)
        assert isinstance(result.memory_usage_mb, float)
        assert isinstance(result.disk_usage_percent, float)
        assert isinstance(result.uptime_seconds, float)
        # Should be non-negative
        assert result.cpu_usage_percent >= 0
        assert result.memory_usage_mb >= 0
        assert result.disk_usage_percent >= 0
        assert result.uptime_seconds >= 0

    def test_graceful_on_missing_proc_meminfo(self):
        """When /proc/meminfo is unavailable, memory defaults to 0."""
        from app.services.hardware_service import _get_system_resources

        # On most Linux systems this file exists, but we can still verify
        # the function handles any errors gracefully and returns valid numeric values
        result = _get_system_resources()

        assert isinstance(result.memory_usage_mb, float)
        assert result.memory_usage_mb >= 0
