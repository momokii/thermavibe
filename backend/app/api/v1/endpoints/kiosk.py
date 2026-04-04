"""Kiosk session state machine API endpoints."""

from fastapi import APIRouter

router = APIRouter()

# Endpoints:
# POST   /api/v1/kiosk/session           - Create new session
# GET    /api/v1/kiosk/session/{id}      - Get session state
# POST   /api/v1/kiosk/session/{id}/capture - Trigger photo capture
# POST   /api/v1/kiosk/session/{id}/print   - Trigger print
# POST   /api/v1/kiosk/session/{id}/finish  - End session and clear data
