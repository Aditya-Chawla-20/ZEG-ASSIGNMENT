"""API v1 router — aggregates all v1 sub-routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.analyses import router as analyses_router
from app.api.v1.config import router as config_router
from app.api.v1.datasets import router as datasets_router
from app.api.v1.parcels import router as parcels_router

router = APIRouter()
router.include_router(parcels_router)
router.include_router(analyses_router)
router.include_router(config_router)
router.include_router(datasets_router)
