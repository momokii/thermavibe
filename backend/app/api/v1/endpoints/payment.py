"""Payment and QRIS webhook API endpoints."""

from fastapi import APIRouter

router = APIRouter()

# Endpoints:
# POST /api/v1/payment/create-qr             - Generate QRIS QR code
# POST /api/v1/payment/webhook/{provider}    - Payment gateway callback
# GET  /api/v1/payment/status/{session_id}   - Poll payment status
