"""Structured logging via structlog.

Logs are rendered as JSON lines and include:
- ``request_id`` (when bound via ``bind_request_context``)
- ``level``
- ``timestamp`` (ISO-8601 UTC)
- ``event`` (the log message)
- any additional keyword fields passed to the logger
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog


def _shared_processors() -> list[Any]:
    return [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]


def configure_logging(level: str = "INFO") -> None:
    """Configure structlog + stdlib logging for the application."""
    log_level = getattr(logging, level.upper(), logging.INFO)

    structlog.configure(
        processors=[
            *_shared_processors(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Route stdlib logging through structlog so library logs are also JSON.
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=structlog.processors.JSONRenderer(),
            foreign_pre_chain=_shared_processors(),
        )
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(log_level)


def get_logger(name: str | None = None) -> Any:
    """Return a structlog logger bound to ``name``."""
    return structlog.get_logger(name)


def bind_request_context(request_id: str, **extra: Any) -> None:
    """Bind request-scoped context (e.g. request_id) to all subsequent logs."""
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, **extra)


def reset_request_context() -> None:
    structlog.contextvars.clear_contextvars()
