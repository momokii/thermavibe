"""Pydantic request/response schemas for the VibePrint OS API."""

from app.schemas.admin import (
    ActiveCameraStatus,
    CameraDeviceInfo,
    CameraStatusDetail,
    ConfigAllResponse,
    ConfigUpdateRequest,
    ConfigUpdateResponse,
    HardwareStatusResponse,
    LoginRequest,
    LoginResponse,
    PrinterDeviceInfo,
    PrinterHardwareStatus,
    PrinterStatusDetail,
    ProviderRevenueStats,
    RevenueAnalyticsResponse,
    RevenueAnalyticsSummary,
    RevenueTimeseriesPoint,
    SessionAnalyticsResponse,
    SessionAnalyticsSummary,
    SessionTimeseriesPoint,
    SystemResources,
)
from app.schemas.ai import AIAnalyzeResponse, TokenUsage
from app.schemas.camera import (
    ActiveCameraInfo,
    CameraDevice,
    CameraListResponse,
    CameraSelectRequest,
    CameraSelectResponse,
    ResolutionInfo,
    StreamParams,
)
from app.schemas.common import (
    ErrorEnvelope,
    ErrorResponse,
    HealthCheckResponse,
    PaginatedResponse,
    SuccessMessage,
)
from app.schemas.config import ConfigEntry
from app.schemas.kiosk import (
    CaptureResponse,
    SessionCreateRequest,
    SessionFinishResponse,
    SessionResponse,
)
from app.schemas.payment import (
    CreateQRRequest,
    CreateQRResponse,
    MidtransWebhookPayload,
    PaymentStatusResponse,
    WebhookAckResponse,
    XenditWebhookPayload,
)
from app.schemas.print import (
    PrintHardwareStatus,
    PrintJobRequest,
    PrinterInfo,
    PrintStatusResponse,
    PrintTestResponse,
)
