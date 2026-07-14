"""Constraint feature model.

Each row is a single feature from a constraint dataset (wetlands, floodplain,
or transmission), stored in the analysis CRS (EPSG:32614). ``layer_type``
identifies which constraint dataset the feature belongs to; ``classification``
is an optional sub-classification (e.g. FEMA flood zone code).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from geoalchemy2 import Geometry
from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.db.base import Base


class ConstraintFeature(Base):
    __tablename__ = "constraint_features"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dataset_metadata.id"),
        nullable=False,
        index=True,
    )
    # wetlands, floodplain, transmission
    layer_type = Column(String, nullable=False, index=True)
    source_id = Column(String, nullable=True)
    # e.g. FEMA flood zone code (A, AE, X, ...) — nullable for non-classified layers
    classification = Column(String, nullable=True, index=True)
    geometry = Column(Geometry("GEOMETRY", srid=32614), nullable=False)
    properties = Column(JSONB, default={})
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ConstraintFeature {self.layer_type} ({self.classification})>"
