"""Unit tests for app.services.payment_service — QR generation, webhooks, status polling."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.core.exceptions import PaymentError
from app.models.session import PaymentStatus
from app.schemas.payment import (
    CreateQRResponse,
    PaymentStatusResponse,
    WebhookAckResponse,
)


# ---------------------------------------------------------------------------
# create_qr_payment — mock provider
# ---------------------------------------------------------------------------

class TestCreateQRPaymentMock:
    """Tests for QR payment creation using the mock provider."""

    @pytest.mark.asyncio
    async def test_mock_provider_creates_payment(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Mock provider should create a payment entry and return a valid response."""
        from app.services.payment_service import create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            response = await create_qr_payment(sample_session_id)

        assert isinstance(response, CreateQRResponse)
        assert response.provider == 'mock'
        assert response.amount == 5000
        assert response.currency == 'IDR'
        assert response.status == PaymentStatus.PENDING
        assert response.payment_id.startswith('mock-')
        assert response.qr_code_url.startswith('https://mock.local/qr/')
        assert response.expires_at is not None

    @pytest.mark.asyncio
    async def test_mock_provider_custom_amount(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Custom amount should override the default from settings."""
        from app.services.payment_service import create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            response = await create_qr_payment(sample_session_id, amount=10000)

        assert response.amount == 10000

    @pytest.mark.asyncio
    async def test_mock_provider_stores_in_memory(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Mock provider should store the payment in _payment_store."""
        from app.services.payment_service import _payment_store, create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            response = await create_qr_payment(sample_session_id)

        key = str(sample_session_id)
        assert key in _payment_store
        assert _payment_store[key]['payment_id'] == response.payment_id
        assert _payment_store[key]['status'] == PaymentStatus.PENDING


# ---------------------------------------------------------------------------
# create_qr_payment — midtrans provider (mocked HTTP)
# ---------------------------------------------------------------------------

class TestCreateQRPaymentMidtrans:
    """Tests for Midtrans QR payment creation (HTTP mocked)."""

    @pytest.mark.asyncio
    async def test_midtrans_no_api_key_raises(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Midtrans should raise PaymentError when server key is not configured."""
        from app.services.payment_service import create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'midtrans'
            mock_settings.midtrans_server_key = ''
            mock_settings.midtrans_is_production = False

            with pytest.raises(PaymentError, match='Midtrans server key not configured'):
                await create_qr_payment(sample_session_id)

    @pytest.mark.asyncio
    async def test_midtrans_success(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Successful Midtrans API call should return a valid response."""
        from app.services.payment_service import create_qr_payment

        mock_response_data = {'token': 'snap-token-abc123'}

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)
        mock_http_client.post = AsyncMock()
        mock_http_client.post.return_value = AsyncMock(
            status_code=201,
            json=lambda: mock_response_data,
            text='',
        )

        with patch('app.services.payment_service.settings') as mock_settings, \
             patch('app.services.payment_service.httpx.AsyncClient', return_value=mock_http_client):
            mock_settings.payment_provider = 'midtrans'
            mock_settings.midtrans_server_key = 'SB-Mid-server-xxx'
            mock_settings.midtrans_is_production = False
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            response = await create_qr_payment(sample_session_id)

        assert isinstance(response, CreateQRResponse)
        assert response.provider == 'midtrans'
        assert response.amount == 5000


# ---------------------------------------------------------------------------
# create_qr_payment — xendit provider (mocked HTTP)
# ---------------------------------------------------------------------------

class TestCreateQRPaymentXendit:
    """Tests for Xendit QR payment creation (HTTP mocked)."""

    @pytest.mark.asyncio
    async def test_xendit_no_api_key_raises(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Xendit should raise PaymentError when API key is not configured."""
        from app.services.payment_service import create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'xendit'
            mock_settings.xendit_api_key = ''

            with pytest.raises(PaymentError, match='Xendit API key not configured'):
                await create_qr_payment(sample_session_id)

    @pytest.mark.asyncio
    async def test_xendit_success(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Successful Xendit API call should return a valid response."""
        from app.services.payment_service import create_qr_payment

        mock_response_data = {
            'qr_code_url': 'https://xendit.co/qr/abc',
            'qr_string': 'xendit-qr-string',
        }

        mock_http_client = AsyncMock()
        mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
        mock_http_client.__aexit__ = AsyncMock(return_value=False)
        mock_http_client.post = AsyncMock()
        mock_http_client.post.return_value = AsyncMock(
            status_code=201,
            json=lambda: mock_response_data,
            text='',
        )

        with patch('app.services.payment_service.settings') as mock_settings, \
             patch('app.services.payment_service.httpx.AsyncClient', return_value=mock_http_client):
            mock_settings.payment_provider = 'xendit'
            mock_settings.xendit_api_key = 'xnd_development_xxx'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120
            mock_settings.app_env = 'http://localhost:8000'

            response = await create_qr_payment(sample_session_id)

        assert isinstance(response, CreateQRResponse)
        assert response.provider == 'xendit'
        assert response.qr_code_url == 'https://xendit.co/qr/abc'


# ---------------------------------------------------------------------------
# get_payment_status
# ---------------------------------------------------------------------------

class TestGetPaymentStatus:
    """Tests for payment status polling."""

    @pytest.mark.asyncio
    async def test_existing_payment_returns_status(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Should return the status of an existing payment."""
        from app.services.payment_service import _payment_store, create_qr_payment, get_payment_status

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        status = await get_payment_status(sample_session_id)

        assert isinstance(status, PaymentStatusResponse)
        assert status.payment_id == created.payment_id
        assert status.status == PaymentStatus.PENDING
        assert status.session_id == sample_session_id

    @pytest.mark.asyncio
    async def test_nonexistent_payment_raises(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Should raise PaymentError when no payment exists for the session."""
        from app.services.payment_service import get_payment_status

        with pytest.raises(PaymentError, match='No payment found'):
            await get_payment_status(sample_session_id)


# ---------------------------------------------------------------------------
# handle_webhook — midtrans
# ---------------------------------------------------------------------------

class TestHandleWebhookMidtrans:
    """Tests for Midtrans webhook processing."""

    @pytest.mark.asyncio
    async def test_settlement_updates_to_confirmed(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Midtrans 'settlement' status should update payment to CONFIRMED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'order_id': created.payment_id,
            'transaction_status': 'settlement',
        }

        ack = await handle_webhook('midtrans', payload)

        assert isinstance(ack, WebhookAckResponse)
        assert ack.status == 'ok'

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.CONFIRMED
        assert _payment_store[key].get('paid_at') is not None

    @pytest.mark.asyncio
    async def test_capture_updates_to_confirmed(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Midtrans 'capture' status should also update payment to CONFIRMED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'order_id': created.payment_id,
            'transaction_status': 'capture',
        }

        await handle_webhook('midtrans', payload)

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.CONFIRMED

    @pytest.mark.asyncio
    async def test_expire_updates_to_expired(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Midtrans 'expire' status should update payment to EXPIRED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'order_id': created.payment_id,
            'transaction_status': 'expire',
        }

        await handle_webhook('midtrans', payload)

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.EXPIRED

    @pytest.mark.asyncio
    async def test_deny_updates_to_denied(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Midtrans 'deny' status should update payment to DENIED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'order_id': created.payment_id,
            'transaction_status': 'deny',
        }

        await handle_webhook('midtrans', payload)

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.DENIED

    @pytest.mark.asyncio
    async def test_webhook_for_unknown_order_still_acknowledges(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Webhook for a non-matching order_id should still return ack (idempotent)."""
        from app.services.payment_service import handle_webhook

        payload = {
            'order_id': 'nonexistent-order-id',
            'transaction_status': 'settlement',
        }

        ack = await handle_webhook('midtrans', payload)
        assert ack.status == 'ok'


# ---------------------------------------------------------------------------
# handle_webhook — xendit
# ---------------------------------------------------------------------------

class TestHandleWebhookXendit:
    """Tests for Xendit webhook processing."""

    @pytest.mark.asyncio
    async def test_paid_updates_to_confirmed(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Xendit 'PAID' status should update payment to CONFIRMED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'external_id': created.payment_id,
            'status': 'PAID',
        }

        ack = await handle_webhook('xendit', payload)

        assert isinstance(ack, WebhookAckResponse)
        assert ack.status == 'ok'

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.CONFIRMED
        assert _payment_store[key].get('paid_at') is not None

    @pytest.mark.asyncio
    async def test_expired_updates_to_expired(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Xendit 'EXPIRED' status should update payment to EXPIRED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'external_id': created.payment_id,
            'status': 'EXPIRED',
        }

        await handle_webhook('xendit', payload)

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.EXPIRED

    @pytest.mark.asyncio
    async def test_failed_updates_to_denied(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Xendit 'FAILED' status should update payment to DENIED."""
        from app.services.payment_service import _payment_store, create_qr_payment, handle_webhook

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            created = await create_qr_payment(sample_session_id)

        payload = {
            'external_id': created.payment_id,
            'status': 'FAILED',
        }

        await handle_webhook('xendit', payload)

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.DENIED


# ---------------------------------------------------------------------------
# handle_webhook — unknown provider
# ---------------------------------------------------------------------------

class TestHandleWebhookUnknown:
    """Tests for unknown payment provider webhook handling."""

    @pytest.mark.asyncio
    async def test_unknown_provider_raises(self, reset_payment_store) -> None:
        """Should raise PaymentError for unknown provider names."""
        from app.services.payment_service import handle_webhook

        with pytest.raises(PaymentError, match='Unknown payment provider'):
            await handle_webhook('stripe', {'data': 'irrelevant'})


# ---------------------------------------------------------------------------
# confirm_payment
# ---------------------------------------------------------------------------

class TestConfirmPayment:
    """Tests for manual mock payment confirmation."""

    @pytest.mark.asyncio
    async def test_confirm_existing_payment(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """confirm_payment should update the status to CONFIRMED."""
        from app.services.payment_service import _payment_store, confirm_payment, create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            await create_qr_payment(sample_session_id)

        response = await confirm_payment(sample_session_id)

        assert isinstance(response, PaymentStatusResponse)
        assert response.status == PaymentStatus.CONFIRMED
        assert response.paid_at is not None

        key = str(sample_session_id)
        assert _payment_store[key]['status'] == PaymentStatus.CONFIRMED

    @pytest.mark.asyncio
    async def test_confirm_nonexistent_payment_raises(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """confirm_payment should raise PaymentError when payment does not exist."""
        from app.services.payment_service import confirm_payment

        with pytest.raises(PaymentError, match='No payment found'):
            await confirm_payment(sample_session_id)

    @pytest.mark.asyncio
    async def test_confirm_twice_is_idempotent(self, sample_session_id: uuid.UUID, reset_payment_store) -> None:
        """Confirming an already-confirmed payment should not raise."""
        from app.services.payment_service import confirm_payment, create_qr_payment

        with patch('app.services.payment_service.settings') as mock_settings:
            mock_settings.payment_provider = 'mock'
            mock_settings.payment_amount = 5000
            mock_settings.payment_currency = 'IDR'
            mock_settings.payment_timeout_seconds = 120

            await create_qr_payment(sample_session_id)

        first = await confirm_payment(sample_session_id)
        second = await confirm_payment(sample_session_id)

        assert first.status == PaymentStatus.CONFIRMED
        assert second.status == PaymentStatus.CONFIRMED
        assert second.paid_at is not None
