"""Constraint repository — database access for constraint features and datasets."""

from __future__ import annotations

from geoalchemy2.elements import WKTElement
from sqlalchemy.orm import Session

from app.db.models.constraint_feature import ConstraintFeature
from app.db.models.dataset_metadata import DatasetMetadata


class ConstraintRepository:
    """Repository for querying constraint features and dataset metadata."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_intersecting(
        self,
        parcel_geom_wkt: str,
        envelope_wkt: str,
        layer_types: list[str],
        classifications: list[str] | None = None,
    ) -> list[ConstraintFeature]:
        """Return constraint features that intersect the parcel geometry.

        Uses a two-stage spatial filter:
        1. BBOX pre-filter using ``envelope_wkt`` (expanded by max buffer).
        2. Exact ``ST_Intersects`` against ``parcel_geom_wkt``.

        Args:
            parcel_geom_wkt: Parcel geometry WKT in analysis CRS (EPSG:32614).
            envelope_wkt: Expanded envelope WKT for bbox pre-filter.
            layer_types: Which layer types to include (wetlands/floodplain/transmission).
            classifications: Optional classification filter (e.g. FEMA zone codes).
        """
        if not layer_types:
            return []

        parcel_wkt = WKTElement(parcel_geom_wkt, srid=32614)
        envelope = WKTElement(envelope_wkt, srid=32614)

        q = self.db.query(ConstraintFeature).filter(
            ConstraintFeature.layer_type.in_(layer_types),
            ConstraintFeature.geometry.ST_Intersects(envelope),
            ConstraintFeature.geometry.ST_Intersects(parcel_wkt),
        )

        if classifications:
            q = q.filter(ConstraintFeature.classification.in_(classifications))

        return q.all()

    def get_datasets(self) -> list[DatasetMetadata]:
        """Return all dataset metadata records."""
        return self.db.query(DatasetMetadata).order_by(DatasetMetadata.name).all()
