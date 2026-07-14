"""Geometry serialization helpers.

Conversions between Shapely geometries, GeoJSON dicts, and GeoAlchemy2
``WKBElement`` objects.
"""

from __future__ import annotations

from geoalchemy2.shape import to_shape
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry


def to_geojson_dict(geom: BaseGeometry | None) -> dict | None:
    """Convert a Shapely geometry to a GeoJSON dict.

    Returns ``None`` if the geometry is ``None`` or empty.
    """
    if geom is None or geom.is_empty:
        return None
    from shapely.geometry import mapping

    return mapping(geom)


def geojson_to_shapely(geojson_dict: dict) -> BaseGeometry | None:
    """Parse a GeoJSON geometry dict into a Shapely geometry.

    Returns ``None`` if the input is empty or missing.
    """
    if not geojson_dict:
        return None
    geom = shape(geojson_dict)
    if geom.is_empty:
        return None
    return geom


def geometry_from_wkb(wkb_element) -> BaseGeometry | None:
    """Convert a GeoAlchemy2 ``WKBElement`` (or ``WKTElement``) to a Shapely geometry.

    If the input is already a Shapely geometry (e.g. in tests), it is returned
    unchanged. Returns ``None`` if the element is ``None``.
    """
    if wkb_element is None:
        return None
    if isinstance(wkb_element, BaseGeometry):
        return wkb_element
    return to_shape(wkb_element)
