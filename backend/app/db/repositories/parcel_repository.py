"""Parcel repository — database access for parcels."""

from __future__ import annotations

from shapely.geometry.base import BaseGeometry
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.db.models.parcel import Parcel
from app.geometry.serialization import geometry_from_wkb


class ParcelRepository:
    """Repository for querying parcels."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def search(
        self,
        query: str | None,
        bbox: list[float] | None,
        limit: int,
        offset: int,
    ) -> tuple[list[Parcel], int]:
        """Search parcels by text query and/or bounding box.

        Args:
            query: Optional text filter on ``display_name`` / ``source_id`` / ``address``.
            bbox: Optional WGS84 bbox [minx, miny, maxx, maxy] for spatial filter.
            limit: Maximum number of results.
            offset: Pagination offset.

        Returns:
            ``(items, total)`` where total is the unfiltered count.
        """
        q = self.db.query(Parcel)

        if query:
            query = query.strip()
            # Fast path: if searching for a source ID or BCAD number
            if query.upper().startswith("BCAD"):
                q = q.filter(Parcel.source_id.ilike(f"{query}%"))
            else:
                # Use prefix matching if the query is short, to utilize indexes/scans faster
                if len(query) < 5:
                    pattern = f"{query}%"
                else:
                    pattern = f"%{query}%"
                q = q.filter(
                    or_(
                        Parcel.display_name.ilike(pattern),
                        Parcel.address.ilike(pattern),
                        Parcel.source_id.ilike(pattern),
                    )
                )

        if bbox and len(bbox) == 4:
            from geoalchemy2.elements import WKTElement
            from shapely.geometry import box as shapely_box
            from shapely.ops import transform

            from app.geometry.crs import get_transformer

            minx, miny, maxx, maxy = bbox
            wgs_bbox = shapely_box(minx, miny, maxx, maxy)
            transformer = get_transformer("EPSG:4326", "EPSG:32614")
            db_bbox = transform(transformer.transform, wgs_bbox)
            bbox_wkt = WKTElement(db_bbox.wkt, srid=32614)
            q = q.filter(Parcel.geometry.ST_Intersects(bbox_wkt))

        total = q.count()
        items = q.order_by(Parcel.display_name).offset(offset).limit(limit).all()
        return items, total

    def get_by_id(self, parcel_id: str) -> Parcel | None:
        """Return a parcel by its UUID string or ``source_id``."""
        from uuid import UUID

        # Try UUID primary key first
        try:
            uid = UUID(str(parcel_id))
            parcel = self.db.query(Parcel).filter(Parcel.id == uid).first()
            if parcel:
                return parcel
        except (ValueError, AttributeError):
            pass

        # Fall back to source_id
        return self.db.query(Parcel).filter(Parcel.source_id == parcel_id).first()

    def get_geometry_in_analysis_crs(self, parcel_id: str) -> BaseGeometry | None:
        """Return the parcel geometry as a Shapely geometry in EPSG:32614."""
        parcel = self.get_by_id(parcel_id)
        if parcel is None:
            return None
        return geometry_from_wkb(parcel.geometry)
