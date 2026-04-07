"""Camera preview and capture API endpoints."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.schemas.camera import CameraListResponse, CameraSelectRequest, CameraSelectResponse, StreamParams
from app.services.camera_service import generate_mjpeg_frames, list_devices, select_device

router = APIRouter()


@router.get('/stream')
async def camera_stream(
    resolution: str = Query(default='1280x720', pattern=r'^\d+x\d+$'),
    fps: int = Query(default=15, ge=5, le=30),
    quality: int = Query(default=85, ge=1, le=100),
) -> StreamingResponse:
    """MJPEG live camera stream for kiosk preview."""
    width, height = resolution.split('x')
    return StreamingResponse(
        generate_mjpeg_frames(
            width=int(width),
            height=int(height),
            fps=fps,
            quality=quality,
        ),
        media_type='multipart/x-mixed-replace; boundary=frame',
    )


@router.get('/devices', response_model=CameraListResponse)
async def list_cameras() -> CameraListResponse:
    """List available camera devices."""
    return list_devices()


@router.post('/select', response_model=CameraSelectResponse)
async def select_camera(body: CameraSelectRequest) -> CameraSelectResponse:
    """Set the active camera device."""
    return select_device(body.device_index)
