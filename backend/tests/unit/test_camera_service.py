"""Unit tests for camera service -- device enumeration, selection, frame capture."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.core.exceptions import CameraError, CameraNotFoundError


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_open_cap(
    index: int = 0,
    backend_name: str = 'V4L2',
    width: int = 1280,
    height: int = 720,
) -> MagicMock:
    """Return a mock VideoCapture that reports as opened."""
    cap = MagicMock()
    cap.isOpened.return_value = True
    cap.getBackendName.return_value = backend_name
    cap.get.side_effect = lambda prop: {3: width, 4: height}.get(prop, 0)
    cap.set.return_value = True
    cap.read.return_value = (True, np.zeros((height, width, 3), dtype=np.uint8))
    return cap


def _make_closed_cap() -> MagicMock:
    """Create a mock VideoCapture that reports as not opened."""
    cap = MagicMock()
    cap.isOpened.return_value = False
    return cap


def _imencode_side(ext, frame, params=None):
    """Return a trivially valid JPEG buffer."""
    return (True, np.frombuffer(b'\xff\xd8\xff\xe0\x00\x10JFIF', dtype=np.uint8))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_camera_state():
    """Reset the module-level camera state between every test."""
    import app.services.camera_service as svc

    svc._active_device_index = None
    svc._active_device_name = ''
    svc._active_device_path = ''
    yield
    svc._active_device_index = None
    svc._active_device_name = ''
    svc._active_device_path = ''


# ---------------------------------------------------------------------------
# list_devices
# ---------------------------------------------------------------------------


class TestListDevices:
    """Tests for list_devices()."""

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_finds_cameras(self, mock_cv2, mock_vcap_cls):
        """list_devices returns devices for indices that are opened."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_cv2.CAP_PROP_FRAME_WIDTH = 3
        mock_cv2.CAP_PROP_FRAME_HEIGHT = 4
        mock_vcap_cls.side_effect = lambda idx: _make_open_cap(idx)

        result = svc.list_devices()

        assert len(result.devices) == 10

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_returns_empty_when_no_cameras(self, mock_cv2, mock_vcap_cls):
        """list_devices returns empty list when no devices can be opened."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_cv2.CAP_PROP_FRAME_WIDTH = 3
        mock_cv2.CAP_PROP_FRAME_HEIGHT = 4
        mock_vcap_cls.side_effect = lambda idx: _make_closed_cap()

        result = svc.list_devices()

        assert len(result.devices) == 0


# ---------------------------------------------------------------------------
# select_device
# ---------------------------------------------------------------------------


class TestSelectDevice:
    """Tests for select_device()."""

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_success(self, mock_cv2, mock_vcap_cls):
        """select_device sets the active device state correctly."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_vcap_cls.return_value = _make_open_cap(3)

        result = svc.select_device(3)

        assert result.active_device.index == 3
        assert result.active_device.path == '/dev/video3'
        assert svc._active_device_index == 3
        assert svc._active_device_path == '/dev/video3'

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_raises_when_device_cannot_open(self, mock_cv2, mock_vcap_cls):
        """select_device raises CameraNotFoundError when device cannot be opened."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_vcap_cls.return_value = _make_closed_cap()

        with pytest.raises(CameraNotFoundError, match='/dev/video5'):
            svc.select_device(5)


# ---------------------------------------------------------------------------
# get_active_camera
# ---------------------------------------------------------------------------


class TestGetActiveCamera:
    """Tests for get_active_camera()."""

    def test_returns_info_when_set(self):
        """get_active_camera returns ActiveCameraInfo when device is active."""
        import app.services.camera_service as svc

        svc._active_device_index = 0
        svc._active_device_name = 'Camera 0'
        svc._active_device_path = '/dev/video0'

        result = svc.get_active_camera()

        assert result is not None
        assert result.index == 0
        assert result.name == 'Camera 0'
        assert result.path == '/dev/video0'

    def test_returns_none_when_not_set(self):
        """get_active_camera returns None when no device is active."""
        import app.services.camera_service as svc

        svc._active_device_index = None

        result = svc.get_active_camera()

        assert result is None


# ---------------------------------------------------------------------------
# capture_frame
# ---------------------------------------------------------------------------


class TestCaptureFrame:
    """Tests for capture_frame()."""

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    async def test_success(self, mock_cv2, mock_vcap_cls):
        """capture_frame returns JPEG bytes on success."""
        import app.services.camera_service as svc

        open_cap = _make_open_cap(0)
        mock_cv2.VideoCapture = mock_vcap_cls
        mock_cv2.CAP_PROP_FRAME_WIDTH = 3
        mock_cv2.CAP_PROP_FRAME_HEIGHT = 4
        mock_cv2.IMWRITE_JPEG_QUALITY = 1
        mock_cv2.imencode = _imencode_side
        mock_vcap_cls.return_value = open_cap

        result = await svc.capture_frame(device_index=0)

        assert isinstance(result, bytes)
        assert len(result) > 0

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    async def test_raises_when_no_device(self, mock_cv2, mock_vcap_cls):
        """capture_frame raises CameraError when device cannot be opened."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_cv2.CAP_PROP_FRAME_WIDTH = 3
        mock_cv2.CAP_PROP_FRAME_HEIGHT = 4
        mock_vcap_cls.return_value = _make_closed_cap()

        with pytest.raises(CameraError, match='Cannot open camera'):
            await svc.capture_frame(device_index=0)

    async def test_raises_when_no_active_device_and_none_index(self):
        """capture_frame raises CameraError when no active device and no index given."""
        import app.services.camera_service as svc
        from unittest.mock import patch as _p

        with _p('app.services.camera_service.cv2.VideoCapture') as mock_vcap, \
             _p('app.services.camera_service.cv2') as mock_cv2:
            mock_cv2.CAP_PROP_FRAME_WIDTH = 3
            mock_cv2.CAP_PROP_FRAME_HEIGHT = 4
            mock_cv2.VideoCapture = mock_vcap
            mock_vcap.return_value = _make_closed_cap()

            with pytest.raises(CameraError):
                await svc.capture_frame()


# ---------------------------------------------------------------------------
# _get_device_name
# ---------------------------------------------------------------------------


class TestGetDeviceName:
    """Tests for _get_device_name()."""

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_with_camera(self, mock_cv2, mock_vcap_cls):
        """_get_device_name returns descriptive name when camera is opened."""
        import app.services.camera_service as svc

        open_cap = _make_open_cap(2, backend_name='V4L2', width=1280, height=720)
        mock_cv2.VideoCapture = mock_vcap_cls
        mock_cv2.CAP_PROP_FRAME_WIDTH = 3
        mock_cv2.CAP_PROP_FRAME_HEIGHT = 4
        mock_vcap_cls.return_value = open_cap

        result = svc._get_device_name(2)

        assert 'Camera 2' in result
        assert 'V4L2' in result
        assert '1280x720' in result

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_without_camera(self, mock_cv2, mock_vcap_cls):
        """_get_device_name returns simple name when camera cannot be opened."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_vcap_cls.return_value = _make_closed_cap()

        result = svc._get_device_name(5)

        assert result == 'Camera 5'

    @patch('app.services.camera_service.cv2.VideoCapture')
    @patch('app.services.camera_service.cv2')
    def test_with_exception(self, mock_cv2, mock_vcap_cls):
        """_get_device_name returns simple name when exception occurs."""
        import app.services.camera_service as svc

        mock_cv2.VideoCapture = mock_vcap_cls
        mock_vcap_cls.side_effect = RuntimeError('device busy')

        result = svc._get_device_name(7)

        assert result == 'Camera 7'
