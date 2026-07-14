"""Pydantic v2 schemas for parcel search/detail responses."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ParcelCentroid(BaseModel):
    """WGS84 (lon, lat) centroid of a parcel."""

    lon: float
    lat: float


class ParcelSearchResult(BaseModel):
    """A single parcel in search results (no full geometry)."""

    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    source_id: str = Field(alias="sourceId")
    display_name: str = Field(alias="displayName")
    county_name: str = Field(alias="countyName")
    address: str | None = None
    source_area_acres: float | None = Field(alias="sourceAreaAcres", default=None)
    centroid: ParcelCentroid


class ParcelDetail(BaseModel):
    """Full parcel detail including WGS84 GeoJSON geometry."""

    model_config = ConfigDict(populate_by_name=True)

    id: UUID
    source_id: str = Field(alias="sourceId")
    display_name: str = Field(alias="displayName")
    county_name: str = Field(alias="countyName")
    address: str | None = None
    source_area_acres: float | None = Field(alias="sourceAreaAcres", default=None)
    geometry_geojson: dict = Field(alias="geometryGeojson")
    centroid: ParcelCentroid


class ParcelSearchResponse(BaseModel):
    """Paginated parcel search response."""

    model_config = ConfigDict(populate_by_name=True)

    items: list[ParcelSearchResult]
    total: int
    limit: int
    offset: int
