"""Unit tests for app.core.exceptions — custom exception hierarchy and status mapping."""

from __future__ import annotations

import pytest

from app.core.exceptions import (
    AIFallbackExhausted,
    AIProviderError,
    CameraError,
    CameraNotFoundError,
    ConfigurationError,
    NotFoundError,
    PaymentError,
    PaymentTimeoutError,
    PrinterError,
    PrinterOfflineError,
    SessionError,
    SessionNotFoundError,
    StateTransitionError,
    VibePrintError,
    status_code_for_error,
)


# ---------------------------------------------------------------------------
# VibePrintError (base)
# ---------------------------------------------------------------------------

class TestVibePrintError:
    """Tests for the base VibePrintError class."""

    def test_stores_message_and_default_code(self) -> None:
        exc = VibePrintError(message='something went wrong')
        assert exc.message == 'something went wrong'
        assert exc.code == 'INTERNAL_ERROR'
        assert str(exc) == 'something went wrong'

    def test_stores_custom_code(self) -> None:
        exc = VibePrintError(message='oops', code='CUSTOM_CODE')
        assert exc.message == 'oops'
        assert exc.code == 'CUSTOM_CODE'

    def test_is_exception(self) -> None:
        exc = VibePrintError(message='test')
        assert isinstance(exc, Exception)


# ---------------------------------------------------------------------------
# NotFoundError
# ---------------------------------------------------------------------------

class TestNotFoundError:
    """Tests for NotFoundError."""

    def test_formats_message_with_resource_and_id(self) -> None:
        exc = NotFoundError(resource='Session', resource_id='abc-123')
        assert exc.message == "Session with id 'abc-123' not found"
        assert exc.code == 'NOT_FOUND'

    def test_is_vibeprint_error(self) -> None:
        exc = NotFoundError(resource='Foo', resource_id='1')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# SessionNotFoundError
# ---------------------------------------------------------------------------

class TestSessionNotFoundError:
    """Tests for SessionNotFoundError."""

    def test_formats_message_with_session_id(self) -> None:
        exc = SessionNotFoundError(session_id='sess-999')
        assert exc.message == "Session with id 'sess-999' not found"
        assert exc.code == 'SESSION_NOT_FOUND'

    def test_is_session_error(self) -> None:
        exc = SessionNotFoundError(session_id='x')
        assert isinstance(exc, SessionError)
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# StateTransitionError
# ---------------------------------------------------------------------------

class TestStateTransitionError:
    """Tests for StateTransitionError."""

    def test_formats_message_with_states(self) -> None:
        exc = StateTransitionError(current_state='idle', target_state='reveal')
        assert exc.message == "Cannot transition from 'idle' to 'reveal'"
        assert exc.code == 'INVALID_STATE_TRANSITION'

    def test_is_vibeprint_error(self) -> None:
        exc = StateTransitionError(current_state='a', target_state='b')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# AIProviderError
# ---------------------------------------------------------------------------

class TestAIProviderError:
    """Tests for AIProviderError."""

    def test_stores_provider_attribute(self) -> None:
        exc = AIProviderError(message='API key missing', provider='openai')
        assert exc.provider == 'openai'
        assert exc.code == 'AI_PROVIDER_ERROR'

    def test_formats_message_with_provider(self) -> None:
        exc = AIProviderError(message='timeout', provider='anthropic')
        assert exc.message == "AI provider 'anthropic' error: timeout"

    def test_default_provider_is_unknown(self) -> None:
        exc = AIProviderError(message='boom')
        assert exc.provider == 'unknown'

    def test_is_vibeprint_error(self) -> None:
        exc = AIProviderError(message='x')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# AIFallbackExhausted
# ---------------------------------------------------------------------------

class TestAIFallbackExhausted:
    """Tests for AIFallbackExhausted."""

    def test_with_fallback_provider(self) -> None:
        exc = AIFallbackExhausted(primary_provider='openai', fallback_provider='anthropic')
        assert exc.code == 'AI_FALLBACK_EXHAUSTED'
        assert "Primary provider 'openai' failed" in exc.message
        assert "fallback provider 'anthropic' also failed" in exc.message

    def test_without_fallback_provider(self) -> None:
        exc = AIFallbackExhausted(primary_provider='mock')
        assert exc.code == 'AI_FALLBACK_EXHAUSTED'
        assert "Primary provider 'mock' failed" in exc.message
        # No fallback clause should be present
        assert 'fallback provider' not in exc.message

    def test_is_vibeprint_error(self) -> None:
        exc = AIFallbackExhausted(primary_provider='x')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# PaymentError
# ---------------------------------------------------------------------------

class TestPaymentError:
    """Tests for PaymentError."""

    def test_default_code(self) -> None:
        exc = PaymentError(message='Payment failed')
        assert exc.message == 'Payment failed'
        assert exc.code == 'PAYMENT_ERROR'

    def test_custom_code(self) -> None:
        exc = PaymentError(message='x', code='PAYMENT_CUSTOM')
        assert exc.code == 'PAYMENT_CUSTOM'

    def test_is_vibeprint_error(self) -> None:
        exc = PaymentError(message='x')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# PaymentTimeoutError
# ---------------------------------------------------------------------------

class TestPaymentTimeoutError:
    """Tests for PaymentTimeoutError."""

    def test_formats_message_with_order_id_and_timeout(self) -> None:
        exc = PaymentTimeoutError(order_id='order-42', timeout_seconds=120)
        assert exc.code == 'PAYMENT_TIMEOUT'
        assert "order 'order-42'" in exc.message
        assert '120s' in exc.message

    def test_is_payment_error(self) -> None:
        exc = PaymentTimeoutError(order_id='o', timeout_seconds=30)
        assert isinstance(exc, PaymentError)
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# PrinterError
# ---------------------------------------------------------------------------

class TestPrinterError:
    """Tests for PrinterError."""

    def test_default_code(self) -> None:
        exc = PrinterError(message='Paper jam')
        assert exc.message == 'Paper jam'
        assert exc.code == 'PRINTER_ERROR'

    def test_custom_code(self) -> None:
        exc = PrinterError(message='x', code='PRINTER_CUSTOM')
        assert exc.code == 'PRINTER_CUSTOM'

    def test_is_vibeprint_error(self) -> None:
        exc = PrinterError(message='x')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# PrinterOfflineError
# ---------------------------------------------------------------------------

class TestPrinterOfflineError:
    """Tests for PrinterOfflineError."""

    def test_fixed_message_and_code(self) -> None:
        exc = PrinterOfflineError()
        assert exc.message == 'Thermal printer is offline or not connected'
        assert exc.code == 'PRINTER_OFFLINE'

    def test_is_printer_error(self) -> None:
        exc = PrinterOfflineError()
        assert isinstance(exc, PrinterError)
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# CameraError
# ---------------------------------------------------------------------------

class TestCameraError:
    """Tests for CameraError."""

    def test_default_code(self) -> None:
        exc = CameraError(message='Device busy')
        assert exc.message == 'Device busy'
        assert exc.code == 'CAMERA_ERROR'

    def test_custom_code(self) -> None:
        exc = CameraError(message='x', code='CAMERA_CUSTOM')
        assert exc.code == 'CAMERA_CUSTOM'

    def test_is_vibeprint_error(self) -> None:
        exc = CameraError(message='x')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# CameraNotFoundError
# ---------------------------------------------------------------------------

class TestCameraNotFoundError:
    """Tests for CameraNotFoundError."""

    def test_without_device_path(self) -> None:
        exc = CameraNotFoundError()
        assert exc.code == 'CAMERA_NOT_FOUND'
        assert exc.message == 'No camera device found'

    def test_with_device_path(self) -> None:
        exc = CameraNotFoundError(device_path='/dev/video0')
        assert exc.code == 'CAMERA_NOT_FOUND'
        assert "at '/dev/video0'" in exc.message

    def test_is_camera_error(self) -> None:
        exc = CameraNotFoundError(device_path='/dev/video1')
        assert isinstance(exc, CameraError)
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# ConfigurationError
# ---------------------------------------------------------------------------

class TestConfigurationError:
    """Tests for ConfigurationError."""

    def test_without_detail(self) -> None:
        exc = ConfigurationError(key='missing_key')
        assert exc.code == 'CONFIGURATION_ERROR'
        assert "key 'missing_key'" in exc.message
        assert ':' not in exc.message.split('key')[-1]  # no detail suffix

    def test_with_detail(self) -> None:
        exc = ConfigurationError(key='timeout', detail='must be positive')
        assert exc.code == 'CONFIGURATION_ERROR'
        assert "key 'timeout'" in exc.message
        assert 'must be positive' in exc.message

    def test_is_vibeprint_error(self) -> None:
        exc = ConfigurationError(key='k')
        assert isinstance(exc, VibePrintError)


# ---------------------------------------------------------------------------
# status_code_for_error
# ---------------------------------------------------------------------------

class TestStatusCodeForError:
    """Tests for the status_code_for_error mapping function."""

    @pytest.mark.parametrize(
        ('code', 'expected'),
        [
            ('NOT_FOUND', 404),
            ('SESSION_NOT_FOUND', 404),
            ('INVALID_STATE_TRANSITION', 409),
            ('AI_PROVIDER_ERROR', 502),
            ('AI_FALLBACK_EXHAUSTED', 502),
            ('PAYMENT_ERROR', 502),
            ('PAYMENT_TIMEOUT', 408),
            ('PRINTER_ERROR', 502),
            ('PRINTER_OFFLINE', 503),
            ('CAMERA_ERROR', 502),
            ('CAMERA_NOT_FOUND', 503),
            ('CONFIGURATION_ERROR', 500),
            ('INTERNAL_ERROR', 500),
            ('AUTH_INVALID_PIN', 401),
            ('AUTH_TOKEN_INVALID', 401),
            ('AUTH_TOKEN_EXPIRED', 401),
            ('RATE_LIMITED', 429),
        ],
    )
    def test_maps_known_code_to_correct_status(self, code: str, expected: int) -> None:
        assert status_code_for_error(code) == expected

    @pytest.mark.parametrize(
        'code',
        ['TOTALLY_UNKNOWN', 'SOMETHING_ELSE', '', 'x' * 50],
    )
    def test_returns_500_for_unknown_codes(self, code: str) -> None:
        assert status_code_for_error(code) == 500
