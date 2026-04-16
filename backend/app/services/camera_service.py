"""Camera handler service — live preview and still capture.

Hardware-agnostic webcam management via OpenCV/V4L2.
Enumerates devices, provides MJPEG streaming, and captures still frames.

Uses a shared singleton cv2.VideoCapture so that the MJPEG preview stream
and the still-capture endpoint never open the device twice (which causes
blank-white frames on most V4L2 USB webcams).

All blocking cv2.read() calls are dispatched to a thread executor so they
never freeze the asyncio event loop — a hung camera device cannot take down
the whole server.
"""

from __future__ import annotations

import asyncio
import functools
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

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------
_active_device_index: int | None = None
_active_device_name: str = ''
_active_device_path: str = ''
_capture_lock = asyncio.Lock()

# Singleton camera shared between MJPEG stream and still capture.
# Never opened twice — capture reads from the same handle the stream uses.
_shared_cap: cv2.VideoCapture | None = None

# If cap.read() blocks longer than this (seconds) we treat it as a hung
# device and fall back to mock frames so the rest of the server keeps working.
_READ_TIMEOUT_S = 5.0


# ---------------------------------------------------------------------------
# Helpers — thread-safe camera reads
# ---------------------------------------------------------------------------

def _blocking_read(cap: cv2.VideoCapture) -> tuple[bool, object]:
    """Run cap.read() synchronously (to be called from a thread)."""
    return cap.read()


async def _threaded_read(cap: cv2.VideoCapture) -> tuple[bool, object]:
    """Read a frame from *cap* in a thread so the event loop stays responsive."""
    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, functools.partial(_blocking_read, cap)),
        timeout=_READ_TIMEOUT_S,
    )


# ---------------------------------------------------------------------------
# Shared camera helpers
# ---------------------------------------------------------------------------

def _get_or_create_camera(
    idx: int,
    width: int | None = None,
    height: int | None = None,
) -> cv2.VideoCapture:
    """Return the shared camera, opening it on first use.

    If the camera is already open the resolution parameters are ignored so
    that an active MJPEG stream is not disrupted.
    """
    global _shared_cap
    if _shared_cap is not None and _shared_cap.isOpened():
        return _shared_cap

    w = width or settings.camera_resolution_width
    h = height or settings.camera_resolution_height

    logger.info('shared_camera_opening', idx=idx, width=w, height=h)
    _shared_cap = cv2.VideoCapture(idx)
    if _shared_cap.isOpened():
        _shared_cap.set(cv2.CAP_PROP_FRAME_WIDTH, w)
        _shared_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, h)
        logger.info('shared_camera_opened', idx=idx)
    else:
        logger.warning('shared_camera_unavailable', idx=idx)
    return _shared_cap


def release_shared_camera() -> None:
    """Release the shared camera.

    Called when the active device changes or on application shutdown.
    """
    global _shared_cap
    if _shared_cap is not None:
        _shared_cap.release()
        _shared_cap = None
        logger.info('shared_camera_released')


# ---------------------------------------------------------------------------
# Public API — device management
# ---------------------------------------------------------------------------

def list_devices() -> CameraListResponse:
    """Enumerate available USB camera devices.

    Uses OpenCV to probe device indices 0-9 and V4L2 device paths.

    Returns:
        CameraListResponse with detected devices.
    """
    devices: list[CameraDevice] = []

    for idx in range(10):
        # Skip the shared camera's index — already open.
        if _shared_cap is not None and _shared_cap.isOpened() and idx == _active_device_index:
            name = _active_device_name
            path = f'/dev/video{idx}'
            devices.append(CameraDevice(
                index=idx,
                name=name,
                path=path,
                resolutions=[],
                is_active=True,
            ))
            continue

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

    Releases the current shared camera so it is re-created with the new
    device index on the next stream / capture request.

    Args:
        device_index: Index of the camera to activate.

    Returns:
        CameraSelectResponse with the active device info.

    Raises:
        CameraNotFoundError: If the device cannot be opened.
    """
    from app.core.exceptions import CameraNotFoundError

    # Verify the new device works (probe then release immediately).
    probe = cv2.VideoCapture(device_index)
    if not probe.isOpened():
        raise CameraNotFoundError(f'/dev/video{device_index}')
    probe.release()

    # Tear down the current shared camera so it is re-created later.
    release_shared_camera()

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


# ---------------------------------------------------------------------------
# Mock frame generator (dev mode fallback)
# ---------------------------------------------------------------------------

def _generate_mock_frame(width: int = 1280, height: int = 720) -> bytes:
    """Generate a synthetic test image for development without a physical camera.

    Creates a gradient image with text overlay indicating mock mode.

    Args:
        width: Image width in pixels.
        height: Image height in pixels.

    Returns:
        JPEG-encoded image bytes.
    """
    import numpy as np

    # Create a gradient background
    img = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        ratio = y / height
        img[y, :] = [
            int(30 + 40 * ratio),   # B
            int(60 + 80 * ratio),   # G
            int(120 + 100 * ratio), # R
        ]

    # Add text overlay
    font = cv2.FONT_HERSHEY_SIMPLEX
    text = 'MOCK CAMERA'
    textsize = cv2.getTextSize(text, font, 2, 3)[0]
    text_x = (width - textsize[0]) // 2
    text_y = (height + textsize[1]) // 2
    cv2.putText(img, text, (text_x, text_y), font, 2, (255, 255, 255), 3, cv2.LINE_AA)

    success, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        raise RuntimeError('Failed to encode mock frame as JPEG')
    return buffer.tobytes()


# ---------------------------------------------------------------------------
# Still capture
# ---------------------------------------------------------------------------

async def capture_frame(
    device_index: int | None = None,
    width: int | None = None,
    height: int | None = None,
) -> bytes:
    """Capture a single frame as JPEG bytes.

    Reads from the **shared** camera instance (the same one the MJPEG stream
    uses) so the device is never opened twice.

    In development mode, falls back to a synthetic test image if no
    physical camera is available.

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
        cap = _get_or_create_camera(idx, w, h)
        if not cap.isOpened():
            if settings.app_env == 'development':
                logger.warning('mock_camera_fallback', reason=f'Cannot open camera device {idx}')
                return _generate_mock_frame(w, h)
            raise CameraError(f'Cannot open camera device {idx}')

        # Discard a couple of frames so auto-exposure settles.
        for _ in range(2):
            try:
                await _threaded_read(cap)
            except asyncio.TimeoutError:
                pass

        try:
            ret, frame = await _threaded_read(cap)
        except asyncio.TimeoutError:
            if settings.app_env == 'development':
                logger.warning('mock_camera_fallback', reason='Frame read timed out')
                return _generate_mock_frame(w, h)
            raise CameraError('Camera read timed out — device may be hung') from None

        if not ret or frame is None:
            if settings.app_env == 'development':
                logger.warning('mock_camera_fallback', reason='Frame read returned empty')
                return _generate_mock_frame(w, h)
            raise CameraError('Failed to capture frame from camera')

        # Encode as high-quality JPEG
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 95]
        success, buffer = cv2.imencode('.jpg', frame, encode_params)
        if not success:
            raise CameraError('Failed to encode frame as JPEG')

        logger.debug('frame_captured', idx=idx, size=len(buffer))
        return buffer.tobytes()


# ---------------------------------------------------------------------------
# MJPEG streaming
# ---------------------------------------------------------------------------

async def generate_mjpeg_frames(
    device_index: int | None = None,
    width: int = 1280,
    height: int = 720,
    fps: int = 15,
    quality: int = 85,
) -> AsyncGenerator[bytes, None]:
    """Generate MJPEG frames for live streaming.

    Uses the **shared** camera instance so it coexists peacefully with
    :func:`capture_frame`.  When a capture is in progress (lock held) the
    stream simply pauses frame reads until the lock is released.

    All cap.read() calls go through a thread executor with a timeout so a
    hung camera device cannot freeze the server.

    Yields:
        MJPEG frame bytes including boundary markers.
    """
    idx = device_index if device_index is not None else _active_device_index
    if idx is None:
        idx = settings.camera_device_index

    cap = _get_or_create_camera(idx, width, height)
    if not cap.isOpened():
        if settings.app_env == 'development':
            logger.warning('mock_camera_stream', reason=f'Cannot open camera device {idx}')
            # Yield mock frames for dev preview
            while True:
                frame_bytes = _generate_mock_frame(width, height)
                yield (
                    b'--frame\r\n'
                    b'Content-Type: image/jpeg\r\n'
                    b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n'
                    + frame_bytes
                    + b'\r\n'
                )
                await asyncio.sleep(1.0 / fps)
        logger.error('camera_stream_open_failed', device_index=idx)
        return

    frame_interval = 1.0 / fps
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    consecutive_failures = 0

    try:
        while cap.isOpened():
            loop_start = time.monotonic()

            # ---- Pause while a still-capture is in progress ----
            if _capture_lock.locked():
                await asyncio.sleep(0.05)
                continue

            # ---- Read frame via thread (non-blocking) ----
            try:
                ret, frame = await _threaded_read(cap)
            except asyncio.TimeoutError:
                logger.warning('camera_stream_read_timeout')
                consecutive_failures += 1
                if consecutive_failures > 3 and settings.app_env == 'development':
                    logger.warning('mock_camera_stream_fallback', reason='Camera read timeouts')
                    # Fall into mock loop so the server stays alive
                    while True:
                        frame_bytes = _generate_mock_frame(width, height)
                        yield (
                            b'--frame\r\n'
                            b'Content-Type: image/jpeg\r\n'
                            b'Content-Length: ' + str(len(frame_bytes)).encode() + b'\r\n\r\n'
                            + frame_bytes
                            + b'\r\n'
                        )
                        await asyncio.sleep(1.0 / fps)
                await asyncio.sleep(0.1)
                continue

            if not ret:
                logger.warning('camera_stream_frame_failed')
                consecutive_failures += 1
                if consecutive_failures > 5:
                    logger.error('camera_stream_too_many_failures')
                    break
                await asyncio.sleep(0.1)
                continue

            consecutive_failures = 0

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
        # Do NOT release the shared camera — it lives across stream
        # lifetimes so that page refreshes or reconnections don't tear
        # down the device while a capture might be queued.
        pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Initialize active camera from settings on module load
# ---------------------------------------------------------------------------
_active_device_index = settings.camera_device_index
_active_device_name = _get_device_name(_active_device_index) if _active_device_index is not None else ''
_active_device_path = f'/dev/video{_active_device_index}' if _active_device_index is not None else ''
