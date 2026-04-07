"""Pydantic schemas for camera API endpoints.

Covers device listing, device selection, and stream parameters.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ResolutionInfo(BaseModel):
    """Supported camera resolution and format."""

    width: int = Field(..., description='Width in pixels')
    height: int = Field(..., description='Height in pixels')
    format: str = Field(..., description='Pixel format (MJPEG, YUYV, etc.)')


class CameraDevice(BaseModel):
    """Information about a detected camera device."""

    index: int = Field(..., description='Device index (for OpenCV)')
    name: str = Field(..., description='Human-readable device name')
    path: str = Field(..., description='V4L2 device path')
    resolutions: list[ResolutionInfo] = Field(
        default_factory=list,
        description='Supported resolutions',
    )
    is_active: bool = Field(False, description='Whether this is the currently active device')


class CameraListResponse(BaseModel):
    """Response for GET /api/v1/camera/devices."""

    devices: list[CameraDevice]


class CameraSelectRequest(BaseModel):
    """Request body for POST /api/v1/camera/select."""

    device_index: int = Field(..., description='Index of the camera device to activate')


class ActiveCameraInfo(BaseModel):
    """Summary of the active camera device."""

    index: int
    name: str
    path: str


class CameraSelectResponse(BaseModel):
    """Response for POST /api/v1/camera/select."""

    message: str
    active_device: ActiveCameraInfo


class StreamParams(BaseModel):
    """Query parameters for GET /api/v1/camera/stream."""

    resolution: str = Field(
        default='1280x720',
        pattern=r'^\d+x\d+$',
        description='Resolution in WIDTHxHEIGHT format',
    )
    fps: int = Field(default=15, ge=5, le=30, description='Target frames per second')
    quality: int = Field(
        default=85,
        ge=1,
        le=100,
        description='JPEG compression quality',
    )
