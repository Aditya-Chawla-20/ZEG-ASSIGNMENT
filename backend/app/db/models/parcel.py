"""Parcel model.

Stores geometry in both two CRSs:
- ``geometry`` in the analysis CRS (EPSG:32614) for all area calculations
- ``geometry_wgs84`` in WGS84 (EPSG:4326) for fast serving to the frontend

``centroid_wgs84`` is a point in WGS84 for quick display on a map.
``owner_name`` is intentionally NOT stored in this demo dataset.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Column, DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base


class Parcel(Base):
    __tablename__ = "parcels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_id = Column(String, unique=True, nullable=False, index=True)
    county_name = Column(String, nullable=False, index=True)
    display_name = Column(String, nullable=False)
    address = Column(Text, nullable=True)
    # owner_name intentionally omitted from API responses.
    source_area_acres = Column(Numeric(precision=12, scale=4), nullable=True)
    geometry = Column(Geometry("MULTIPOLYGON", srid=32614), nullable=False)
    geometry_wgs84 = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=False)
    centroid_wgs84 = Column(Geometry("POINT", srid=4326), nullable=False)
    properties = Column(JSONB, default={})
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Parcel {self.source_id} ({self.county_name})>"
