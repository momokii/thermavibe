"""Integration tests for payment flow -- QRIS creation, status polling, and webhooks.

Tests exercise the FastAPI payment endpoints via httpx AsyncClient with
ASGITransport. The payment_service and session_service are mocked at the
endpoint module level so no real payment gateway is required.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.session import PaymentStatus
from app.schemas.payment import (
    CreateQRResponse,
    PaymentStatusResponse,
    WebhookAckResponse,
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_qr_payment_returns_200(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/payment/create-qr returns CreateQRResponse."""
    now = datetime.now(timezone.utc)
    mock_qr_response = CreateQRResponse(
        payment_id='mock-abc123',
        session_id=sample_session_id,
        provider='mock',
        amount=5000,
        currency='IDR',
        status='pending',
        qr_code_url='https://mock.local/qr/mock-abc123.png',
        qr_string='mock-qris-mock-abc123',
        expires_at=now,
        created_at=now,
    )

    with (
        patch('app.api.v1.endpoints.payment.payment_service') as pay_svc,
        patch('app.api.v1.endpoints.payment.session_service') as sess_svc,
    ):
        pay_svc.create_qr_payment = AsyncMock(return_value=mock_qr_response)
        sess_svc.record_payment = AsyncMock()

        resp = await client.post(
            '/api/v1/payment/create-qr',
            json={
                'session_id': str(sample_session_id),
                'amount': 5000,
                'currency': 'IDR',
            },
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data['payment_id'] == 'mock-abc123'
    assert data['session_id'] == str(sample_session_id)
    assert data['provider'] == 'mock'
    assert data['amount'] == 5000
    assert data['status'] == 'pending'
    assert data['qr_code_url'] is not None
    assert data['qr_string'] is not None
    pay_svc.create_qr_payment.assert_awaited_once()
    sess_svc.record_payment.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_qr_payment_records_session(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/payment/create-qr calls session_service.record_payment."""
    now = datetime.now(timezone.utc)
    mock_qr_response = CreateQRResponse(
        payment_id='mock-xyz789',
        session_id=sample_session_id,
        provider='mock',
        amount=10000,
        currency='IDR',
        status='pending',
        qr_code_url='https://mock.local/qr/mock-xyz789.png',
        qr_string='mock-qris-mock-xyz789',
        expires_at=now,
        created_at=now,
    )

    with (
        patch('app.api.v1.endpoints.payment.payment_service') as pay_svc,
        patch('app.api.v1.endpoints.payment.session_service') as sess_svc,
    ):
        pay_svc.create_qr_payment = AsyncMock(return_value=mock_qr_response)
        sess_svc.record_payment = AsyncMock()

        resp = await client.post(
            '/api/v1/payment/create-qr',
            json={
                'session_id': str(sample_session_id),
                'amount': 10000,
            },
        )

    assert resp.status_code == 200
    # Verify session_service.record_payment was called with the right args
    sess_svc.record_payment.assert_awaited_once()
    call_kwargs = sess_svc.record_payment.call_args.kwargs
    assert str(call_kwargs.get('session_id')) == str(sample_session_id)
    assert call_kwargs.get('provider') == 'mock'
    assert call_kwargs.get('amount') == 10000
    assert call_kwargs.get('reference') == 'mock-xyz789'
    assert call_kwargs.get('status') == 'pending'


@pytest.mark.asyncio
async def test_create_qr_payment_session_record_failure_still_returns(client: AsyncClient, sample_session_id: uuid.UUID):
    """POST /api/v1/payment/create-qr still returns QR even if session recording fails."""
    now = datetime.now(timezone.utc)
    mock_qr_response = CreateQRResponse(
        payment_id='mock-fail123',
        session_id=sample_session_id,
        provider='mock',
        amount=5000,
        currency='IDR',
        status='pending',
        qr_code_url='https://mock.local/qr/mock-fail123.png',
        qr_string='mock-qris-mock-fail123',
        expires_at=now,
        created_at=now,
    )

    with (
        patch('app.api.v1.endpoints.payment.payment_service') as pay_svc,
        patch('app.api.v1.endpoints.payment.session_service') as sess_svc,
    ):
        pay_svc.create_qr_payment = AsyncMock(return_value=mock_qr_response)
        sess_svc.record_payment = AsyncMock(side_effect=Exception('DB down'))

        resp = await client.post(
            '/api/v1/payment/create-qr',
            json={
                'session_id': str(sample_session_id),
                'amount': 5000,
            },
        )

    # The endpoint catches session recording failures and still returns QR
    assert resp.status_code == 200
    assert resp.json()['payment_id'] == 'mock-fail123'


@pytest.mark.asyncio
async def test_get_payment_status_returns_200(client: AsyncClient, sample_session_id: uuid.UUID):
    """GET /api/v1/payment/status/{session_id} returns PaymentStatusResponse."""
    now = datetime.now(timezone.utc)
    mock_status = PaymentStatusResponse(
        payment_id='mock-abc123',
        session_id=sample_session_id,
        provider='mock',
        amount=5000,
        currency='IDR',
        status='confirmed',
        paid_at=now,
        expires_at=now,
        created_at=now,
    )

    with patch('app.api.v1.endpoints.payment.payment_service') as pay_svc:
        pay_svc.get_payment_status = AsyncMock(return_value=mock_status)

        resp = await client.get(f'/api/v1/payment/status/{sample_session_id}')

    assert resp.status_code == 200
    data = resp.json()
    assert data['payment_id'] == 'mock-abc123'
    assert data['session_id'] == str(sample_session_id)
    assert data['status'] == 'confirmed'
    assert data['paid_at'] is not None
    pay_svc.get_payment_status.assert_awaited_once_with(sample_session_id)


@pytest.mark.asyncio
async def test_get_payment_status_not_found(client: AsyncClient, sample_session_id: uuid.UUID):
    """GET /api/v1/payment/status/{bad_id} returns error when payment missing."""
    from app.core.exceptions import PaymentError

    with patch('app.api.v1.endpoints.payment.payment_service') as pay_svc:
        pay_svc.get_payment_status = AsyncMock(
            side_effect=PaymentError(f'No payment found for session {sample_session_id}')
        )

        resp = await client.get(f'/api/v1/payment/status/{sample_session_id}')

    assert resp.status_code == 502
    data = resp.json()
    assert 'error' in data
    assert data['error']['code'] == 'PAYMENT_ERROR'


@pytest.mark.asyncio
async def test_webhook_midtrans_returns_200(client: AsyncClient, reset_payment_store):
    """POST /api/v1/payment/webhook/midtrans processes webhook and returns ok."""
    mock_ack = WebhookAckResponse(status='ok')
    payload = {
        'order_id': 'vb-testorder',
        'transaction_status': 'capture',
        'transaction_id': 'txn-123',
        'status_message': 'success',
        'status_code': '200',
        'signature_key': 'sig',
        'payment_type': 'gopay',
        'merchant_id': 'M123',
        'gross_amount': '5000',
        'fraud_status': 'accept',
    }

    with patch('app.api.v1.endpoints.payment.payment_service') as pay_svc:
        pay_svc.handle_webhook = AsyncMock(return_value=mock_ack)

        resp = await client.post('/api/v1/payment/webhook/midtrans', json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'ok'
    pay_svc.handle_webhook.assert_awaited_once_with('midtrans', payload)


@pytest.mark.asyncio
async def test_webhook_xendit_returns_200(client: AsyncClient, reset_payment_store):
    """POST /api/v1/payment/webhook/xendit processes webhook and returns ok."""
    mock_ack = WebhookAckResponse(status='ok')
    payload = {
        'id': 'xendit-pay-123',
        'external_id': 'vb-xendit-order',
        'status': 'PAID',
        'amount': 5000,
        'payment_method': 'QRIS',
        'created': '2025-01-01T00:00:00.000Z',
    }

    with patch('app.api.v1.endpoints.payment.payment_service') as pay_svc:
        pay_svc.handle_webhook = AsyncMock(return_value=mock_ack)

        resp = await client.post('/api/v1/payment/webhook/xendit', json=payload)

    assert resp.status_code == 200
    data = resp.json()
    assert data['status'] == 'ok'
    pay_svc.handle_webhook.assert_awaited_once_with('xendit', payload)


@pytest.mark.asyncio
async def test_webhook_unknown_provider_returns_error(client: AsyncClient):
    """POST /api/v1/payment/webhook/unknown returns error."""
    from app.core.exceptions import PaymentError

    with patch('app.api.v1.endpoints.payment.payment_service') as pay_svc:
        pay_svc.handle_webhook = AsyncMock(
            side_effect=PaymentError('Unknown payment provider: unknown')
        )

        resp = await client.post('/api/v1/payment/webhook/unknown', json={})

    assert resp.status_code == 502
    data = resp.json()
    assert data['error']['code'] == 'PAYMENT_ERROR'
