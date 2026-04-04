"""Thermal printer API endpoints."""

from fastapi import APIRouter

router = APIRouter()

# Endpoints:
# POST /api/v1/print/test   - Print test receipt (admin auth)
# GET  /api/v1/print/status - Check printer status (admin auth)
