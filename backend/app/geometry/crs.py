"""Coordinate reference system helpers.

All transforms use pyproj with ``always_xy=True`` so that coordinates are
consistently (x=lon, y=lat) → (x=easting, y=northing).
"""

from __future__ import annotations

from pyproj import Transformer
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform

from app.core.config import get_settings


def get_transformer(from_crs: str, to_crs: str) -> Transformer:
    """Return a pyproj Transformer between two CRSs (always_xy)."""
    return Transformer.from_crs(from_crs, to_crs, always_xy=True)


def to_analysis_crs(geom: BaseGeometry, from_crs: str = "EPSG:4326") -> BaseGeometry:
    """Transform geometry to the configured analysis CRS (EPSG:32614)."""
    settings = get_settings()
    transformer = get_transformer(from_crs, settings.ANALYSIS_CRS)
    return transform(transformer.transform, geom)


def to_wgs84(geom: BaseGeometry, from_crs: str | None = None) -> BaseGeometry:
    """Transform geometry from analysis CRS to WGS84 (EPSG:4326)."""
    settings = get_settings()
    src = from_crs or settings.ANALYSIS_CRS
    transformer = get_transformer(src, settings.WGS84_CRS)
    return transform(transformer.transform, geom)
