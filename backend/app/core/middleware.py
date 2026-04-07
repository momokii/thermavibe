"""CORS, request logging, and error handling middleware."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import structlog

from app.core.config import settings
from app.core.exceptions import VibePrintError, status_code_for_error
from app.schemas.common import ErrorEnvelope, ErrorResponse
from app.utils.logging import bind_request_context, clear_request_context, generate_request_id

logger = structlog.get_logger(__name__)


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
        allow_methods=['*'],
        allow_headers=['*'],
    )
