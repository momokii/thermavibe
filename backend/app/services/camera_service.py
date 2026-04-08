"""Camera handler service — live preview and still capture.

Hardware-agnostic webcam management via OpenCV/V4L2.
Enumerates devices, provides MJPEG streaming, and captures still frames.
"""

from __future__ import annotations

import asyncio
import io
import time
from collections.abc import AsyncGenerator

import cv2
import structlog

from app.core.config import settings
from app.schemas.camera import (
    ActiveCameraInfo,
    CameraDevice,
    CameraListResponse,
    CameraSelectResponse,
    ResolutionInfo,
)

logger = structlog.get_logger(__name__)

# Module-level state
_active_device_index: int | None = None
_active_device_name: str = ''
_active_device_path: str = ''
_capture_lock = asyncio.Lock()


def list_devices() -> CameraListResponse:
    """Enumerate available USB camera devices.

    Uses OpenCV to probe device indices 0-9 and V4L2 device paths.

    Returns:
        CameraListResponse with detected devices.
    """
    devices: list[CameraDevice] = []

    for idx in range(10):
        cap = cv2.VideoCapture(idx)
        if cap.isOpened():
            name = _get_device_name(idx)
            path = f'/dev/video{idx}'
            resolutions = _get_supported_resolutions(cap)

            devices.append(CameraDevice(
                index=idx,
                name=name,
                path=path,
                resolutions=resolutions,
                is_active=(idx == _active_device_index),
            ))
            cap.release()

    return CameraListResponse(devices=devices)


def select_device(device_index: int) -> CameraSelectResponse:
    """Set the active camera device.

    Args:
        device_index: Index of the camera to activate.

    Returns:
        CameraSelectResponse with the active device info.

    Raises:
        CameraNotFoundError: If the device cannot be opened.
    """
    from app.core.exceptions import CameraNotFoundError

    cap = cv2.VideoCapture(device_index)
    if not cap.isOpened():
        raise CameraNotFoundError(f'/dev/video{device_index}')
    cap.release()

    global _active_device_index, _active_device_name, _active_device_path
    _active_device_index = device_index
    _active_device_name = _get_device_name(device_index)
    _active_device_path = f'/dev/video{device_index}'

    logger.info('camera_selected', device_index=device_index, name=_active_device_name)

    return CameraSelectResponse(
        message=f'Camera device {device_index} selected',
        active_device=ActiveCameraInfo(
            index=device_index,
            name=_active_device_name,
            path=_active_device_path,
        ),
    )


def get_active_camera() -> ActiveCameraInfo | None:
    """Get info about the currently active camera.

    Returns:
        ActiveCameraInfo or None if no camera is selected.
    """
    if _active_device_index is None:
        return None
    return ActiveCameraInfo(
        index=_active_device_index,
        name=_active_device_name,
        path=_active_device_path,
    )


async def capture_frame(
    device_index: int | None = None,
    width: int | None = None,
    height: int | None = None,
) -> bytes:
    """Capture a single frame as JPEG bytes.

    Args:
        device_index: Device to capture from (defaults to active device).
        width: Target width (defaults to settings).
        height: Target height (defaults to settings).

    Returns:
        JPEG-encoded image bytes.

    Raises:
        CameraError: If no camera is available or capture fails.
    """
    from app.core.exceptions import CameraError

    idx = device_index if device_index is not None else _active_device_index
    if idx is None:
        idx = settings.camera_device_index

    w = width or settings.camera_resolution_width
    h = height or settings.camera_resolution_height

    async with _capture_lock:
        cap = cv2.VideoCapture(idx)
        if not cap.isOpened():
            raise CameraError(f'Cannot open camera device {idx}')

        try:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)

            # Discard first few frames to let auto-exposure settle
            for _ in range(3):
                cap.read()

            ret, frame = cap.read()
            if not ret or frame is None:
                raise CameraError('Failed to capture frame from camera')

            # Encode as JPEG
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, 95]
            success, buffer = cv2.imencode('.jpg', frame, encode_params)
            if not success:
                raise CameraError('Failed to encode frame as JPEG')

            return buffer.tobytes()
        finally:
            cap.release()


async def generate_mjpeg_frames(
    device_index: int | None = None,
    width: int = 1280,
    height: int = 720,
    fps: int = 15,
    quality: int = 85,
) -> AsyncGenerator[bytes, None]:
    """Generate MJPEG frames for live streaming.

    Yields JPEG frames wrapped in the MJPEG multipart boundary format.

    Args:
        device_index: Device to stream from.
        width: Stream resolution width.
        height: Stream resolution height.
        fps: Target frames per second.
        quality: JPEG quality (1-100).

    Yields:
        MJPEG frame bytes including boundary markers.
    """
    idx = device_index if device_index is not None else _active_device_index
    if idx is None:
        idx = settings.camera_device_index

    cap = cv2.VideoCapture(idx)
    if not cap.isOpened():
        logger.error('camera_stream_open_failed', device_index=idx)
        return

    try:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

        frame_interval = 1.0 / fps
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]

        while cap.isOpened():
            loop_start = time.monotonic()

            ret, frame = cap.read()
            if not ret:
                logger.warning('camera_stream_frame_failed')
                await asyncio.sleep(0.1)
                continue

            success, buffer = cv2.imencode('.jpg', frame, encode_params)
            if not success:
                continue

            frame_bytes = buffer.tobytes()
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n'
                b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n'
                + frame_bytes
                + b'\r\n'
            )

            # Frame rate limiting
            elapsed = time.monotonic() - loop_start
            sleep_time = frame_interval - elapsed
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
    finally:
        cap.release()


def _get_device_name(index: int) -> str:
    """Get a human-readable name for a camera device."""
    try:
        cap = cv2.VideoCapture(index)
        if cap.isOpened():
            backend = cap.getBackendName() if hasattr(cap, 'getBackendName') else 'Unknown'
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            cap.release()
            return f'Camera {index} ({backend}, {w}x{h})'
    except Exception:
        pass
    return f'Camera {index}'


def _get_supported_resolutions(cap: cv2.VideoCapture) -> list[ResolutionInfo]:
    """Probe common resolutions supported by a capture device."""
    common = [
        (1920, 1080),
        (1280, 720),
        (640, 480),
        (320, 240),
    ]
    supported: list[ResolutionInfo] = []
    for w, h in common:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if actual_w == w and actual_h == h:
            supported.append(ResolutionInfo(width=w, height=h, format='MJPEG'))
    return supported


# Initialize active camera from settings on module load
_active_device_index = settings.camera_device_index
_active_device_name = _get_device_name(_active_device_index) if _active_device_index is not None else ''
_active_device_path = f'/dev/video{_active_device_index}' if _active_device_index is not None else ''
