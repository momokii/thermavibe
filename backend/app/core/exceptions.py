"""Custom exception classes for VibePrint OS.

All application errors use this hierarchy. Routes and services must never
raise raw Python exceptions — catch and re-raise as application-specific
exceptions instead.

Hierarchy:
    VibePrintError (base)
    ├── NotFoundError
    ├── SessionError
    │   └── SessionNotFoundError
    ├── StateTransitionError
    ├── AIProviderError
    │   └── AIFallbackExhausted
    ├── PaymentError
    │   └── PaymentTimeoutError
    ├── PrinterError
    │   └── PrinterOfflineError
    ├── CameraError
    │   └── CameraNotFoundError
    └── ConfigurationError
"""

from __future__ import annotations


class VibePrintError(Exception):
    """Base exception for all VibePrint OS errors.

    Attributes:
        message: Human-readable error description.
        code: Machine-readable error code for API responses.
    """

    def __init__(self, message: str, code: str = 'INTERNAL_ERROR') -> None:
        self.message = message
        self.code = code
        super().__init__(self.message)


class NotFoundError(VibePrintError):
    """Raised when a requested resource is not found."""

    def __init__(self, resource: str, resource_id: str) -> None:
        super().__init__(
            message=f"{resource} with id '{resource_id}' not found",
            code='NOT_FOUND',
        )


class SessionError(VibePrintError):
    """Base exception for session-related errors."""

    def __init__(self, message: str, code: str = 'SESSION_ERROR') -> None:
        super().__init__(message=message, code=code)


class SessionNotFoundError(SessionError):
    """Raised when a kiosk session is not found."""

    def __init__(self, session_id: str) -> None:
        super().__init__(
            message=f"Session with id '{session_id}' not found",
            code='SESSION_NOT_FOUND',
        )


class StateTransitionError(VibePrintError):
    """Raised when an invalid state machine transition is attempted."""

    def __init__(self, current_state: str, target_state: str) -> None:
        super().__init__(
            message=f"Cannot transition from '{current_state}' to '{target_state}'",
            code='INVALID_STATE_TRANSITION',
        )


class AIProviderError(VibePrintError):
    """Raised when an AI provider fails to process a request.

    Attributes:
        provider: Name of the AI provider that failed.
    """

    def __init__(self, message: str, provider: str = 'unknown') -> None:
        self.provider = provider
        super().__init__(
            message=f"AI provider '{provider}' error: {message}",
            code='AI_PROVIDER_ERROR',
        )


class AIFallbackExhausted(VibePrintError):
    """Raised when all AI providers (including fallback) have failed."""

    def __init__(self, primary_provider: str, fallback_provider: str | None = None) -> None:
        parts = [f"Primary provider '{primary_provider}' failed"]
        if fallback_provider:
            parts.append(f"fallback provider '{fallback_provider}' also failed")
        super().__init__(
            message='; '.join(parts),
            code='AI_FALLBACK_EXHAUSTED',
        )


class PaymentError(VibePrintError):
    """Base exception for payment-related errors."""

    def __init__(self, message: str, code: str = 'PAYMENT_ERROR') -> None:
        super().__init__(message=message, code=code)


class PaymentTimeoutError(PaymentError):
    """Raised when a payment attempt times out before confirmation."""

    def __init__(self, order_id: str, timeout_seconds: int) -> None:
        super().__init__(
            message=f"Payment for order '{order_id}' timed out after {timeout_seconds}s",
            code='PAYMENT_TIMEOUT',
        )


class PrinterError(VibePrintError):
    """Base exception for printer-related errors."""

    def __init__(self, message: str, code: str = 'PRINTER_ERROR') -> None:
        super().__init__(message=message, code=code)


class PrinterOfflineError(PrinterError):
    """Raised when the thermal printer is not connected or unreachable."""

    def __init__(self) -> None:
        super().__init__(
            message='Thermal printer is offline or not connected',
            code='PRINTER_OFFLINE',
        )


class CameraError(VibePrintError):
    """Base exception for camera-related errors."""

    def __init__(self, message: str, code: str = 'CAMERA_ERROR') -> None:
        super().__init__(message=message, code=code)


class CameraNotFoundError(CameraError):
    """Raised when no camera device can be detected."""

    def __init__(self, device_path: str | None = None) -> None:
        detail = f" at '{device_path}'" if device_path else ''
        super().__init__(
            message=f'No camera device found{detail}',
            code='CAMERA_NOT_FOUND',
        )


class ConfigurationError(VibePrintError):
    """Raised when a configuration value is missing or invalid."""

    def __init__(self, key: str, detail: str = '') -> None:
        message = f"Configuration error for key '{key}'"
        if detail:
            message += f': {detail}'
        super().__init__(message=message, code='CONFIGURATION_ERROR')


def status_code_for_error(code: str) -> int:
    """Map error codes to HTTP status codes.

    Args:
        code: Machine-readable error code from a VibePrintError.

    Returns:
        HTTP status code as integer.
    """
    mapping: dict[str, int] = {
        'NOT_FOUND': 404,
        'SESSION_NOT_FOUND': 404,
        'INVALID_STATE_TRANSITION': 409,
        'AI_PROVIDER_ERROR': 502,
        'AI_FALLBACK_EXHAUSTED': 502,
        'PAYMENT_ERROR': 502,
        'PAYMENT_TIMEOUT': 408,
        'PRINTER_ERROR': 502,
        'PRINTER_OFFLINE': 503,
        'CAMERA_ERROR': 502,
        'CAMERA_NOT_FOUND': 503,
        'CONFIGURATION_ERROR': 500,
        'INTERNAL_ERROR': 500,
        'AUTH_INVALID_PIN': 401,
        'AUTH_TOKEN_INVALID': 401,
        'AUTH_TOKEN_EXPIRED': 401,
        'RATE_LIMITED': 429,
    }
    return mapping.get(code, 500)
