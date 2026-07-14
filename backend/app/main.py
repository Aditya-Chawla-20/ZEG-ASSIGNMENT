"""FastAPI application factory and entry point."""

from __future__ import annotations

import time
import uuid

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import router as v1_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.base import get_db

logger = get_logger(__name__)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    configure_logging(settings.LOG_LEVEL)

    app = FastAPI(
        title="LandScope API",
        description="Buildable Land Analysis API",
        version="1.0.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization", "X-Request-Id"],
    )

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
        request.state.request_id = request_id
        start = time.monotonic()
        response = await call_next(request)
        duration = (time.monotonic() - start) * 1000
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Response-Time"] = f"{duration:.1f}ms"
        return response

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "service": "landscope-api"}

    @app.get("/ready")
    async def ready(db: Session = Depends(get_db)) -> dict:
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ready"}
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail={"status": "not_ready", "error": str(e)},
            ) from e

    app.include_router(v1_router, prefix="/api/v1")
    return app


app = create_app()
