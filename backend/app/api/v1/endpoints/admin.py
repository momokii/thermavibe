"""Operator admin dashboard API endpoints."""

from fastapi import APIRouter

router = APIRouter()

# Endpoints:
# POST /api/v1/admin/login                    - PIN authentication
# GET  /api/v1/admin/config                   - Get all configuration
# PUT  /api/v1/admin/config/{category}        - Update configuration
# GET  /api/v1/admin/analytics/sessions       - Session analytics
# GET  /api/v1/admin/analytics/revenue        - Revenue analytics
# GET  /api/v1/admin/hardware/status          - Hardware status
# POST /api/v1/admin/hardware/camera/test     - Test camera
# POST /api/v1/admin/hardware/printer/test    - Test printer
