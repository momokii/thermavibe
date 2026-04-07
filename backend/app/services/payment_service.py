"""Payment gateway abstraction service — QRIS support.

Dispatches to the configured payment provider (Midtrans, Xendit, or Mock).
Generates QRIS QR codes, processes webhooks, and tracks payment status.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone

import httpx
import structlog

from app.core.config import settings
from app.core.exceptions import PaymentError, PaymentTimeoutError
from app.models.session import PaymentStatus
from app.schemas.payment import (
    CreateQRResponse,
    PaymentStatusResponse,
    WebhookAckResponse,
)

logger = structlog.get_logger(__name__)

# In-memory payment store for mock and development.
# In production, payments are tracked via KioskSession fields and provider webhooks.
_payment_store: dict[str, dict] = {}


async def create_qr_payment(
    session_id: uuid.UUID,
    amount: int | None = None,
    currency: str = 'IDR',
) -> CreateQRResponse:
    """Generate a QRIS QR code payment for a session.

    Args:
        session_id: UUID of the kiosk session.
        amount: Payment amount in IDR (defaults to settings).
        currency: Currency code.

    Returns:
        CreateQRResponse with QR code details.

    Raises:
        PaymentError: If the payment provider fails.
    """
    payment_amount = amount or settings.payment_amount
    provider = settings.payment_provider

    if provider == 'midtrans':
        return await _create_midtrans_payment(session_id, payment_amount, currency)
    elif provider == 'xendit':
        return await _create_xendit_payment(session_id, payment_amount, currency)
    else:
        return await _create_mock_payment(session_id, payment_amount, currency)


async def get_payment_status(session_id: uuid.UUID) -> PaymentStatusResponse:
    """Get the current payment status for a session.

    Args:
        session_id: UUID of the kiosk session.

    Returns:
        PaymentStatusResponse with current status.

    Raises:
        PaymentError: If no payment exists for the session.
    """
    key = str(session_id)
    payment = _payment_store.get(key)

    if payment is None:
        raise PaymentError(f'No payment found for session {session_id}')

    return PaymentStatusResponse(
        payment_id=payment['payment_id'],
        session_id=session_id,
        provider=payment['provider'],
        amount=payment['amount'],
        currency=payment['currency'],
        status=payment['status'],
        paid_at=payment.get('paid_at'),
        expires_at=payment.get('expires_at'),
        created_at=payment['created_at'],
    )


async def handle_webhook(provider: str, payload: dict) -> WebhookAckResponse:
    """Process a payment webhook from a provider.

    Args:
        provider: Provider name (midtrans, xendit).
        payload: Raw webhook payload.

    Returns:
        WebhookAckResponse acknowledging receipt.

    Raises:
        PaymentError: If webhook processing fails.
    """
    if provider == 'midtrans':
        return await _handle_midtrans_webhook(payload)
    elif provider == 'xendit':
        return await _handle_xendit_webhook(payload)
    else:
        raise PaymentError(f'Unknown payment provider: {provider}')


async def confirm_payment(session_id: uuid.UUID) -> PaymentStatusResponse:
    """Manually confirm a mock payment (for testing).

    Args:
        session_id: UUID of the kiosk session.

    Returns:
        Updated PaymentStatusResponse.
    """
    key = str(session_id)
    payment = _payment_store.get(key)

    if payment is None:
        raise PaymentError(f'No payment found for session {session_id}')

    payment['status'] = PaymentStatus.CONFIRMED
    payment['paid_at'] = datetime.now(timezone.utc)

    logger.info('payment_confirmed', session_id=str(session_id))

    return PaymentStatusResponse(
        payment_id=payment['payment_id'],
        session_id=session_id,
        provider=payment['provider'],
        amount=payment['amount'],
        currency=payment['currency'],
        status=payment['status'],
        paid_at=payment['paid_at'],
        expires_at=payment.get('expires_at'),
        created_at=payment['created_at'],
    )


# --- Mock Provider ---

async def _create_mock_payment(
    session_id: uuid.UUID,
    amount: int,
    currency: str,
) -> CreateQRResponse:
    """Create a mock QRIS payment for development."""
    payment_id = f'mock-{uuid.uuid4().hex[:12]}'
    now = datetime.now(timezone.utc)
    expires_at = datetime.fromtimestamp(
        now.timestamp() + settings.payment_timeout_seconds,
        tz=timezone.utc,
    )

    _payment_store[str(session_id)] = {
        'payment_id': payment_id,
        'provider': 'mock',
        'amount': amount,
        'currency': currency,
        'status': PaymentStatus.PENDING,
        'qr_code_url': f'https://mock.local/qr/{payment_id}.png',
        'qr_string': f'mock-qris-{payment_id}',
        'created_at': now,
        'expires_at': expires_at,
    }

    logger.info(
        'mock_payment_created',
        session_id=str(session_id),
        payment_id=payment_id,
        amount=amount,
    )

    return CreateQRResponse(
        payment_id=payment_id,
        session_id=session_id,
        provider='mock',
        amount=amount,
        currency=currency,
        status=PaymentStatus.PENDING,
        qr_code_url=f'https://mock.local/qr/{payment_id}.png',
        qr_string=f'mock-qris-{payment_id}',
        expires_at=expires_at,
        created_at=now,
    )


# --- Midtrans Provider ---

async def _create_midtrans_payment(
    session_id: uuid.UUID,
    amount: int,
    currency: str,
) -> CreateQRResponse:
    """Create a QRIS payment via Midtrans."""
    if not settings.midtrans_server_key:
        raise PaymentError('Midtrans server key not configured')

    base_url = (
        'https://app.midtrans.com/snap/v1'
        if settings.midtrans_is_production
        else 'https://app.sandbox.midtrans.com/snap/v1'
    )

    order_id = f'vb-{uuid.uuid4().hex[:12]}'
    now = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f'{base_url}/transactions',
            headers={
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': f'Basic {settings.midtrans_server_key}',
            },
            json={
                'transaction_details': {
                    'order_id': order_id,
                    'gross_amount': amount,
                },
                'item_details': [
                    {
                        'id': 'viberead-001',
                        'price': amount,
                        'quantity': 1,
                        'name': 'Vibe Reading',
                    },
                ],
                'payment_type': 'gopay',
            },
        )

    if response.status_code not in (200, 201):
        raise PaymentError(f'Midtrans API error: {response.status_code} {response.text}')

    data = response.json()
    token = data.get('token', '')

    _payment_store[str(session_id)] = {
        'payment_id': order_id,
        'provider': 'midtrans',
        'amount': amount,
        'currency': currency,
        'status': PaymentStatus.PENDING,
        'qr_code_url': f'https://app.sandbox.midtrans.com/snap/v2/vtweb/{token}',
        'qr_string': token,
        'created_at': now,
    }

    return CreateQRResponse(
        payment_id=order_id,
        session_id=session_id,
        provider='midtrans',
        amount=amount,
        currency=currency,
        status=PaymentStatus.PENDING,
        qr_code_url=f'https://app.sandbox.midtrans.com/snap/v2/vtweb/{token}',
        qr_string=token,
        expires_at=None,
        created_at=now,
    )


async def _handle_midtrans_webhook(payload: dict) -> WebhookAckResponse:
    """Handle Midtrans payment webhook."""
    order_id = payload.get('order_id', '')
    status = payload.get('transaction_status', '')

    # Find the payment by order_id
    for key, payment in _payment_store.items():
        if payment.get('payment_id') == order_id:
            if status == 'capture' or status == 'settlement':
                payment['status'] = PaymentStatus.CONFIRMED
                payment['paid_at'] = datetime.now(timezone.utc)
            elif status == 'expire':
                payment['status'] = PaymentStatus.EXPIRED
            elif status == 'deny':
                payment['status'] = PaymentStatus.DENIED
            elif status == 'refund':
                payment['status'] = PaymentStatus.REFUNDED

            logger.info(
                'midtrans_webhook_processed',
                order_id=order_id,
                status=status,
            )
            break

    return WebhookAckResponse()


# --- Xendit Provider ---

async def _create_xendit_payment(
    session_id: uuid.UUID,
    amount: int,
    currency: str,
) -> CreateQRResponse:
    """Create a QRIS payment via Xendit."""
    if not settings.xendit_api_key:
        raise PaymentError('Xendit API key not configured')

    now = datetime.now(timezone.utc)
    external_id = f'vb-{uuid.uuid4().hex[:12]}'

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            'https://api.xendit.co/qr_codes',
            headers={
                'Content-Type': 'application/json',
            },
            auth=(settings.xendit_api_key, ''),
            json={
                'reference_id': external_id,
                'type': 'DYNAMIC',
                'currency': currency,
                'amount': amount,
                'callback_url': f'{settings.app_env}/api/v1/payment/webhook/xendit',
            },
        )

    if response.status_code not in (200, 201):
        raise PaymentError(f'Xendit API error: {response.status_code} {response.text}')

    data = response.json()

    _payment_store[str(session_id)] = {
        'payment_id': external_id,
        'provider': 'xendit',
        'amount': amount,
        'currency': currency,
        'status': PaymentStatus.PENDING,
        'qr_code_url': data.get('qr_code_url', ''),
        'qr_string': data.get('qr_string', ''),
        'created_at': now,
    }

    return CreateQRResponse(
        payment_id=external_id,
        session_id=session_id,
        provider='xendit',
        amount=amount,
        currency=currency,
        status=PaymentStatus.PENDING,
        qr_code_url=data.get('qr_code_url', ''),
        qr_string=data.get('qr_string', ''),
        expires_at=None,
        created_at=now,
    )


async def _handle_xendit_webhook(payload: dict) -> WebhookAckResponse:
    """Handle Xendit payment webhook."""
    external_id = payload.get('external_id', '')
    status = payload.get('status', '')

    for key, payment in _payment_store.items():
        if payment.get('payment_id') == external_id:
            if status == 'PAID':
                payment['status'] = PaymentStatus.CONFIRMED
                payment['paid_at'] = datetime.now(timezone.utc)
            elif status == 'EXPIRED':
                payment['status'] = PaymentStatus.EXPIRED
            elif status == 'FAILED':
                payment['status'] = PaymentStatus.DENIED

            logger.info(
                'xendit_webhook_processed',
                external_id=external_id,
                status=status,
            )
            break

    return WebhookAckResponse()
