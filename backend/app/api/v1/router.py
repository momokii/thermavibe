"""V1 API router that aggregates all endpoint routers."""

from fastapi import APIRouter

from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.ai import router as ai_router
from app.api.v1.endpoints.camera import router as camera_router
from app.api.v1.endpoints.kiosk import router as kiosk_router
from app.api.v1.endpoints.payment import router as payment_router
from app.api.v1.endpoints.printer import router as printer_router

router = APIRouter(prefix="/api/v1")

router.include_router(kiosk_router, prefix="/kiosk", tags=["kiosk"])
router.include_router(camera_router, prefix="/camera", tags=["camera"])
router.include_router(ai_router, prefix="/ai", tags=["ai"])
router.include_router(printer_router, prefix="/print", tags=["print"])
router.include_router(payment_router, prefix="/payment", tags=["payment"])
router.include_router(admin_router, prefix="/admin", tags=["admin"])
