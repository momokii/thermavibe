"""Pydantic schemas for payment API endpoints.

Covers QR creation, webhook payloads, and status polling for QRIS payments.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateQRRequest(BaseModel):
    """Request body for POST /api/v1/payment/create-qr."""

    session_id: UUID = Field(..., description='Session to associate payment with')
    amount: int = Field(..., gt=0, description='Payment amount in smallest currency unit (IDR)')
    currency: str = Field(default='IDR', description='Currency code')


class CreateQRResponse(BaseModel):
    """Response for POST /api/v1/payment/create-qr."""

    payment_id: str = Field(..., description='Internal payment reference')
    session_id: UUID
    provider: str = Field(..., description='Payment provider name')
    amount: int
    currency: str
    status: str = Field(..., description='Payment status (PENDING, PAID, etc.)')
    qr_code_url: str = Field(..., description='URL to the QR code image')
    qr_string: str = Field(..., description='Raw QR string for client-side rendering')
    expires_at: datetime | None = None
    created_at: datetime


class PaymentStatusResponse(BaseModel):
    """Response for GET /api/v1/payment/status/{session_id}."""

    payment_id: str
    session_id: UUID
    provider: str
    amount: int
    currency: str
    status: str
    paid_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime


class MidtransWebhookPayload(BaseModel):
    """Normalized Midtrans webhook payload.

    Received at POST /api/v1/payment/webhook/midtrans.
    """

    transaction_time: str
    transaction_status: str
    transaction_id: str
    status_message: str
    status_code: str
    signature_key: str
    payment_type: str
    order_id: str
    merchant_id: str
    gross_amount: str
    fraud_status: str | None = None


class XenditWebhookPayload(BaseModel):
    """Normalized Xendit webhook payload.

    Received at POST /api/v1/payment/webhook/xendit.
    """

    id: str = Field(..., alias='id')
    external_id: str
    status: str
    amount: int
    payment_method: str
    created: str
    updated: str | None = None

    model_config = {'populate_by_name': True}


class WebhookAckResponse(BaseModel):
    """Acknowledgement response for webhook endpoints."""

    status: str = 'ok'
