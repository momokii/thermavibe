"""Structured JSON logging setup using structlog.

Provides:
- Structured logging configuration with JSON output
- Correlation ID generation for request tracing
- Request-scoped log context injection
"""

from __future__ import annotations

import logging
import uuid

import structlog


def setup_logging(log_level: str = 'INFO') -> None:
    """Configure structlog for structured JSON logging.

    Args:
        log_level: Minimum log level (DEBUG, INFO, WARNING, ERROR, CRITICAL).
    """
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt='iso'),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelName(log_level),
        ),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Configure stdlib logging to render via structlog
    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.dev.ConsoleRenderer(),
        ],
        foreign_pre_chain=shared_processors,
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.getLevelName(log_level))


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    """Get a structlog logger instance.

    Args:
        name: Logger name, typically __name__ of the calling module.

    Returns:
        A bound structlog logger.
    """
    return structlog.get_logger(name)


def generate_request_id() -> str:
    """Generate a unique request ID for correlation.

    Returns:
        A UUID4-based request ID string.
    """
    return str(uuid.uuid4())


def bind_request_context(request_id: str, **extra: str) -> None:
    """Bind request-scoped context variables for structured logging.

    All log entries within this request will include the request_id
    and any additional context variables.

    Args:
        request_id: The unique request ID for correlation.
        **extra: Additional context variables to bind.
    """
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, **extra)


def clear_request_context() -> None:
    """Clear all request-scoped context variables."""
    structlog.contextvars.clear_contextvars()
