"""Payment and QRIS webhook API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.schemas.payment import (
    CreateQRRequest,
    CreateQRResponse,
    PaymentStatusResponse,
    WebhookAckResponse,
)
from app.services import payment_service, session_service

router = APIRouter()


@router.post('/create-qr', response_model=CreateQRResponse)
async def create_qr_payment(
    body: CreateQRRequest,
    db: AsyncSession = Depends(get_db_session),
) -> CreateQRResponse:
    """Generate a QRIS QR code for payment."""
    result = await payment_service.create_qr_payment(
        session_id=body.session_id,
        amount=body.amount,
        currency=body.currency,
    )

    # Update session with payment info
    try:
        await session_service.record_payment(
            db=db,
            session_id=body.session_id,
            provider=result.provider,
            amount=result.amount,
            reference=result.payment_id,
            status='pending',
        )
    except Exception:
        pass

    return result


@router.post('/webhook/{provider}', response_model=WebhookAckResponse)
async def payment_webhook(
    provider: str,
    request: Request,
) -> WebhookAckResponse:
    """Handle payment gateway webhooks from Midtrans or Xendit."""
    payload = await request.json()
    return await payment_service.handle_webhook(provider, payload)


@router.get('/status/{session_id}', response_model=PaymentStatusResponse)
async def get_payment_status(
    session_id: UUID,
) -> PaymentStatusResponse:
    """Poll the payment status for a session."""
    return await payment_service.get_payment_status(session_id)
