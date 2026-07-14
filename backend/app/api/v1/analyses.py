"""Analysis endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import LandScopeError, ParcelNotFoundError
from app.core.logging import bind_request_context, get_logger, reset_request_context
from app.db.base import get_db
from app.db.repositories.constraint_repository import ConstraintRepository
from app.db.repositories.parcel_repository import ParcelRepository
from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.services.analysis_service import AnalysisService

router = APIRouter()
logger = get_logger(__name__)


def _validate_manual_edits(request: AnalysisRequest) -> list[str]:
    """Validate manual edits against configured limits. Returns warnings."""
    settings = get_settings()
    warnings: list[str] = []

    for label, fc in [
        ("exclusion", request.manual_edits.exclusions),
        ("restoration", request.manual_edits.restorations),
    ]:
        features = fc.get("features", [])
        if len(features) > settings.MAX_MANUAL_FEATURES:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Too many manual {label} features: "
                    f"{len(features)} (max {settings.MAX_MANUAL_FEATURES})"
                ),
            )
        for feat in features:
            geom = feat.get("geometry", {})
            coords = geom.get("coordinates", [])
            # Count coordinates recursively
            count = _count_coordinates(coords)
            if count > settings.MAX_COORDINATES_PER_FEATURE:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"A manual {label} feature has {count} coordinates "
                        f"(max {settings.MAX_COORDINATES_PER_FEATURE})"
                    ),
                )

    return warnings


def _count_coordinates(coords) -> int:
    """Recursively count coordinate pairs in a GeoJSON coordinates array."""
    if not coords:
        return 0
    if isinstance(coords[0], (int, float)):
        return 1
    return sum(_count_coordinates(c) for c in coords)


@router.post("/analyses", response_model=AnalysisResponse)
async def run_analysis(
    request: AnalysisRequest,
    raw_request: Request,
    db: Session = Depends(get_db),
) -> AnalysisResponse:
    """Run a buildable-land analysis for a parcel."""
    request_id = raw_request.headers.get("X-Request-Id") or raw_request.state.request_id
    bind_request_context(request_id)

    # Validate manual edits
    _validate_manual_edits(request)

    parcel_repo = ParcelRepository(db)
    constraint_repo = ConstraintRepository(db)
    service = AnalysisService(parcel_repo, constraint_repo)

    try:
        response = service.run_analysis(request, request_id)
        return response
    except ParcelNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except LandScopeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("analysis_failed", request_id=request_id)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e}") from e
    finally:
        reset_request_context()
