"""Pydantic v2 schemas for the analysis request/response contract."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ConstraintConfig(BaseModel):
    """Configuration for a single constraint layer in an analysis request."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal["wetlands", "floodplain", "transmission"]
    enabled: bool = True
    buffer_meters: float = Field(alias="bufferMeters", default=30.0, ge=0, le=5000)
    classifications: list[str] = []


class ManualEdits(BaseModel):
    """User-drawn manual exclusion and restoration polygons (GeoJSON)."""

    model_config = ConfigDict(populate_by_name=True)

    exclusions: dict = Field(default_factory=lambda: {"type": "FeatureCollection", "features": []})
    restorations: dict = Field(
        default_factory=lambda: {"type": "FeatureCollection", "features": []}
    )


class AnalysisRequest(BaseModel):
    """Full analysis request: parcel + constraint configs + manual edits."""

    model_config = ConfigDict(populate_by_name=True)

    parcel_id: str = Field(alias="parcelId")
    constraints: list[ConstraintConfig] = []
    manual_edits: ManualEdits = Field(alias="manualEdits", default_factory=ManualEdits)


class BreakdownItem(BaseModel):
    """Per-constraint breakdown of excluded area (ordered unique attribution)."""

    model_config = ConfigDict(populate_by_name=True)

    constraint_type: str = Field(alias="constraintType")
    label: str
    enabled: bool
    buffer_meters: float = Field(alias="bufferMeters")
    raw_intersection_acres: float = Field(alias="rawIntersectionAcres")
    uniquely_removed_acres: float = Field(alias="uniquelyRemovedAcres")
    percentage_of_parcel: float = Field(alias="percentageOfParcel")
    reason: str
    source_dataset_id: str | None = Field(alias="sourceDatasetId", default=None)


class AnalysisSummary(BaseModel):
    """High-level area summary."""

    model_config = ConfigDict(populate_by_name=True)

    parcel_acres: float = Field(alias="parcelAcres")
    excluded_acres: float = Field(alias="excludedAcres")
    buildable_acres: float = Field(alias="buildableAcres")
    buildable_percentage: float = Field(alias="buildablePercentage")


class AnalysisGeometry(BaseModel):
    """WGS84 GeoJSON geometries for the analysis result."""

    model_config = ConfigDict(populate_by_name=True)

    parcel: dict
    buildable: dict | None = None
    excluded: dict | None = None
    exclusions_by_constraint: dict = Field(alias="exclusionsByConstraint", default_factory=dict)
    manual_exclusions: dict | None = Field(alias="manualExclusions", default=None)
    manual_restorations: dict | None = Field(alias="manualRestorations", default=None)


class AnalysisMetrics(BaseModel):
    """Performance and diagnostic metrics."""

    model_config = ConfigDict(populate_by_name=True)

    analysis_duration_ms: float = Field(alias="analysisDurationMs")
    candidate_constraint_features: int = Field(alias="candidateConstraintFeatures")


class AnalysisResponse(BaseModel):
    """Full analysis response."""

    model_config = ConfigDict(populate_by_name=True)

    analysis_id: str = Field(alias="analysisId")
    summary: AnalysisSummary
    breakdown: list[BreakdownItem]
    geometry: AnalysisGeometry
    warnings: list[str] = []
    metrics: AnalysisMetrics
