"""Parcel search and detail endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.logging import get_logger
from app.db.base import get_db
from app.db.repositories.parcel_repository import ParcelRepository
from app.geometry.serialization import geometry_from_wkb
from app.schemas.parcel import (
    ParcelCentroid,
    ParcelDetail,
    ParcelSearchResponse,
    ParcelSearchResult,
)

router = APIRouter()
logger = get_logger(__name__)


def _parse_bbox(bbox: str | None) -> list[float] | None:
    """Parse a comma-separated bbox string into [minx, miny, maxx, maxy]."""
    if not bbox:
        return None
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(
            status_code=422,
            detail="bbox must be 4 comma-separated values: minx,miny,maxx,maxy",
        )
    try:
        return [float(p.strip()) for p in parts]
    except ValueError:
        raise HTTPException(status_code=422, detail="bbox values must be numeric") from None


@router.get("/parcels", response_model=ParcelSearchResponse)
async def search_parcels(
    query: str | None = Query(default=None),
    bbox: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ParcelSearchResponse:
    """Search parcels by text query and/or WGS84 bounding box."""
    settings = get_settings()
    if limit > settings.MAX_PARCEL_SEARCH_LIMIT:
        limit = settings.MAX_PARCEL_SEARCH_LIMIT

    bbox_list = _parse_bbox(bbox)
    repo = ParcelRepository(db)
    items, total = repo.search(query=query, bbox=bbox_list, limit=limit, offset=offset)

    results: list[ParcelSearchResult] = []
    for parcel in items:
        centroid_geom = geometry_from_wkb(parcel.centroid_wgs84)
        centroid = None
        if centroid_geom is not None:
            centroid = ParcelCentroid(lon=centroid_geom.x, lat=centroid_geom.y)
        else:
            centroid = ParcelCentroid(lon=0.0, lat=0.0)

        results.append(
            ParcelSearchResult(
                id=parcel.id,
                source_id=parcel.source_id,
                display_name=parcel.display_name,
                county_name=parcel.county_name,
                address=parcel.address,
                source_area_acres=(
                    float(parcel.source_area_acres)
                    if parcel.source_area_acres is not None
                    else None
                ),
                centroid=centroid,
            )
        )

    return ParcelSearchResponse(items=results, total=total, limit=limit, offset=offset)


@router.get("/parcels/{parcel_id}", response_model=ParcelDetail)
async def get_parcel(parcel_id: str, db: Session = Depends(get_db)) -> ParcelDetail:
    """Return full parcel detail including WGS84 GeoJSON geometry."""
    repo = ParcelRepository(db)
    parcel = repo.get_by_id(parcel_id)
    if parcel is None:
        raise HTTPException(status_code=404, detail=f"Parcel '{parcel_id}' not found")

    geom_wgs84 = geometry_from_wkb(parcel.geometry_wgs84)
    if geom_wgs84 is None:
        raise HTTPException(status_code=500, detail="Parcel has no valid WGS84 geometry")

    from shapely.geometry import mapping

    geometry_geojson = mapping(geom_wgs84)

    centroid_geom = geometry_from_wkb(parcel.centroid_wgs84)
    centroid = (
        ParcelCentroid(lon=centroid_geom.x, lat=centroid_geom.y)
        if centroid_geom is not None
        else ParcelCentroid(lon=0.0, lat=0.0)
    )

    return ParcelDetail(
        id=parcel.id,
        source_id=parcel.source_id,
        display_name=parcel.display_name,
        county_name=parcel.county_name,
        address=parcel.address,
        source_area_acres=(
            float(parcel.source_area_acres) if parcel.source_area_acres is not None else None
        ),
        geometry_geojson=geometry_geojson,
        centroid=centroid,
    )
