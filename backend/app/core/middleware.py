"""CORS, request logging, rate limiting, and error handling middleware."""

from __future__ import annotations

import time

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.exceptions import VibePrintError, status_code_for_error
from app.schemas.common import ErrorEnvelope, ErrorResponse
from app.utils.logging import bind_request_context, clear_request_context, generate_request_id

logger = structlog.get_logger(__name__)

# --- Rate Limiting ---

_rate_limit_store: dict[str, list[float]] = {}


def _get_client_ip(scope: dict) -> str:
    """Extract client IP from ASGI scope."""
    client = scope.get('client')
    if client:
        return client[0]
    for header_name, header_value in scope.get('headers', []):
        if header_name == b'x-forwarded-for':
            return header_value.decode().split(',')[0].strip()
    return 'unknown'


class RateLimitMiddleware:
    """ASGI middleware that limits requests per IP per minute."""

    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60) -> None:
        self.app = app
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def __call__(self, scope, receive, send):
        if scope['type'] not in ('http',):
            await self.app(scope, receive, send)
            return

        path = scope.get('path', '')

        # Skip rate limiting for health checks and MJPEG streams
        if path == '/health' or '/camera/stream' in path:
            await self.app(scope, receive, send)
            return

        ip = _get_client_ip(scope)
        now = time.monotonic()

        # Clean old entries and count recent requests
        requests = _rate_limit_store.get(ip, [])
        requests = [t for t in requests if now - t < self.window_seconds]
        requests.append(now)
        _rate_limit_store[ip] = requests

        if len(requests) > self.max_requests:
            logger.warning('rate_limited', ip=ip, path=path, requests=len(requests))
            await self._send_429(scope, receive, send)
            return

        await self.app(scope, receive, send)

    async def _send_429(self, scope, receive, send) -> None:
        """Send a 429 Too Many Requests response."""
        import json

        body = json.dumps({
            'error': {
                'code': 'RATE_LIMITED',
                'message': 'Too many requests. Please try again later.',
                'request_id': None,
            },
        }).encode()

        await send({
            'type': 'http.response.start',
            'status': 429,
            'headers': [
                [b'content-type', b'application/json'],
                [b'content-length', str(len(body)).encode()],
            ],
        })
        await send({
            'type': 'http.response.body',
            'body': body,
        })


# --- Request Size Limit ---

class RequestSizeLimitMiddleware:
    """ASGI middleware that rejects requests exceeding size limits."""

    def __init__(
        self,
        app,
        default_max_bytes: int = 1 * 1024 * 1024,
        upload_max_bytes: int = 10 * 1024 * 1024,
    ) -> None:
        self.app = app
        self.default_max_bytes = default_max_bytes
        self.upload_max_bytes = upload_max_bytes
        self.upload_prefixes = ('/api/v1/ai/analyze',)

    async def __call__(self, scope, receive, send):
        if scope['type'] not in ('http',):
            await self.app(scope, receive, send)
            return

        path = scope.get('path', '')

        # Determine the limit for this path
        is_upload = any(path.startswith(prefix) for prefix in self.upload_prefixes)
        max_bytes = self.upload_max_bytes if is_upload else self.default_max_bytes

        # Check Content-Length header
        for header_name, header_value in scope.get('headers', []):
            if header_name == b'content-length':
                try:
                    content_length = int(header_value.decode())
                    if content_length > max_bytes:
                        logger.warning(
                            'request_too_large',
                            path=path,
                            content_length=content_length,
                            max_bytes=max_bytes,
                        )
                        await self._send_413(scope, receive, send)
                        return
                except ValueError:
                    pass
                break

        await self.app(scope, receive, send)

    async def _send_413(self, scope, receive, send) -> None:
        """Send a 413 Payload Too Large response."""
        import json

        body = json.dumps({
            'error': {
                'code': 'PAYLOAD_TOO_LARGE',
                'message': 'Request payload exceeds the allowed size limit.',
                'request_id': None,
            },
        }).encode()

        await send({
            'type': 'http.response.start',
            'status': 413,
            'headers': [
                [b'content-type', b'application/json'],
                [b'content-length', str(len(body)).encode()],
            ],
        })
        await send({
            'type': 'http.response.body',
            'body': body,
        })


class RequestIDMiddleware:
    """ASGI middleware that injects X-Request-ID and binds structlog context."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] not in ('http', 'websocket'):
            await self.app(scope, receive, send)
            return

        request_id = None
        for header_name, header_value in scope.get('headers', []):
            if header_name == b'x-request-id':
                request_id = header_value.decode()
                break

        if not request_id:
            request_id = generate_request_id()

        bind_request_context(request_id=request_id)

        async def send_with_request_id(message):
            if message['type'] == 'http.response.start':
                headers = list(message.get('headers', []))
                headers.append((b'x-request-id', request_id.encode()))
                message['headers'] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            clear_request_context()


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI instance."""

    @app.exception_handler(VibePrintError)
    async def vibepint_error_handler(request: Request, exc: VibePrintError) -> JSONResponse:
        request_id = getattr(request.state, 'request_id', None)
        status_code = status_code_for_error(exc.code)
        envelope = ErrorEnvelope(
            error=ErrorResponse(
                code=exc.code,
                message=exc.message,
                request_id=request_id,
            ),
        )
        return JSONResponse(
            status_code=status_code,
            content=envelope.model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, 'request_id', None)
        logger.exception('unhandled_exception', error=str(exc))
        envelope = ErrorEnvelope(
            error=ErrorResponse(
                code='INTERNAL_ERROR',
                message='An unexpected error occurred.',
                request_id=request_id,
            ),
        )
        return JSONResponse(
            status_code=500,
            content=envelope.model_dump(),
        )


def setup_cors(app: FastAPI) -> None:
    """Add CORS middleware with origins from settings."""
    origins_str = getattr(settings, 'cors_allowed_origins', '')
    origins = [o.strip() for o in origins_str.split(',') if o.strip()]
    if not origins:
        origins = ['http://localhost:5173', 'http://localhost:8000']

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=['GET', 'POST', 'PUT'],
        allow_headers=['Content-Type', 'Authorization', 'X-Request-ID'],
    )
