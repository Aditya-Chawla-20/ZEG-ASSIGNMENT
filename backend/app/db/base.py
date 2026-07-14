"""SQLAlchemy declarative base, engine, session factory, and FastAPI dependency.

Uses a synchronous engine (psycopg2) per the project spec. The ``get_db``
dependency yields a session and ensures it is closed after the request.
"""

from __future__ import annotations

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all LandScope models."""


@lru_cache(maxsize=1)  # type: ignore[misc]
def _get_engine():
    settings = get_settings()
    return create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        future=True,
    )


@lru_cache(maxsize=1)  # type: ignore[misc]
def _get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=_get_engine(), autocommit=False, autoflush=False, future=True)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a SQLAlchemy session."""
    session = _get_session_factory()()
    try:
        yield session
    finally:
        session.close()
