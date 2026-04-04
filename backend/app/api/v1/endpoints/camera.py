"""Camera preview and capture API endpoints."""

from fastapi import APIRouter

router = APIRouter()

# Endpoints:
# GET  /api/v1/camera/stream   - MJPEG live stream
# GET  /api/v1/camera/devices  - List available cameras
# POST /api/v1/camera/select   - Set active camera
