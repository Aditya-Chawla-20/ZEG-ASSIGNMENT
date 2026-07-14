"""Geometry operations.

All area calculations assume the geometry is in a *projected* CRS
(EPSG:32614 for this project) — never in EPSG:4326 or EPSG:3857.

Key design decisions:
- ``unary_union`` is used (not the deprecated ``union_all``).
- ``make_valid`` is applied to repair invalid geometries.
- Sliver removal drops polygon parts below a configurable area tolerance.
- ``sqm_to_acres`` uses exactly ``4046.8564224`` as the divisor.
"""

from __future__ import annotations

from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.validation import make_valid

from app.core.config import get_settings

Polygonal = Polygon | MultiPolygon


def repair_geometry(geom: BaseGeometry) -> BaseGeometry:
    """Apply ``shapely.validation.make_valid`` to repair an invalid geometry."""
    if geom.is_valid:
        return geom
    return make_valid(geom)


def normalize_geometry(geom: BaseGeometry | None) -> Polygonal | None:
    """Extract polygonal parts from any geometry type and repair validity.

    Returns ``None`` if the geometry is empty, ``None``, or has no polygonal
    parts (e.g. a Point or LineString).
    """
    if geom is None:
        return None
    if geom.is_empty:
        return None

    repaired = repair_geometry(geom)

    # ``make_valid`` may return a GeometryCollection of mixed types.
    # Extract only polygonal parts.
    if isinstance(repaired, (Polygon, MultiPolygon)):
        polys = list(repaired.geoms) if isinstance(repaired, MultiPolygon) else [repaired]
    elif isinstance(repaired, GeometryCollection):
        polys = [g for g in repaired.geoms if isinstance(g, (Polygon, MultiPolygon))]
        # Flatten nested MultiPolygons
        flat: list[Polygon] = []
        for p in polys:
            if isinstance(p, MultiPolygon):
                flat.extend(p.geoms)
            else:
                flat.append(p)
        polys = flat
    else:
        return None

    polys = [p for p in polys if not p.is_empty]
    if not polys:
        return None

    if len(polys) == 1:
        return polys[0]
    return MultiPolygon(polys)


def buffer_geometry(geom: BaseGeometry, meters: float) -> BaseGeometry:
    """Buffer a geometry by ``meters`` in the analysis (projected) CRS.

    Assumes ``geom`` is already in a projected CRS where units are metres.
    """
    if meters <= 0:
        return geom
    return geom.buffer(meters)


def safe_intersection(a: BaseGeometry | None, b: BaseGeometry | None) -> BaseGeometry | None:
    """Intersection with a validity check. Returns ``None`` if either input is ``None``."""
    if a is None or b is None:
        return None
    result = a.intersection(b)
    if result.is_empty:
        return result
    if not result.is_valid:
        result = make_valid(result)
    return result


def safe_union(geometries: list[BaseGeometry]) -> BaseGeometry | None:
    """Union a list of geometries. Returns ``None`` for an empty list."""
    geoms = [g for g in geometries if g is not None and not g.is_empty]
    if not geoms:
        return None
    result = unary_union(geoms)
    if result.is_empty:
        return result
    if not result.is_valid:
        result = make_valid(result)
    return result


def safe_difference(a: BaseGeometry | None, b: BaseGeometry | None) -> BaseGeometry | None:
    """Difference with a validity check. Returns ``a`` if ``b`` is ``None``."""
    if a is None:
        return None
    if b is None or b.is_empty:
        return a
    result = a.difference(b)
    if result.is_empty:
        return result
    if not result.is_valid:
        result = make_valid(result)
    return result


def remove_slivers(
    geom: BaseGeometry | None, tolerance_sqm: float | None = None
) -> BaseGeometry | None:
    """Remove tiny polygon parts below ``tolerance_sqm`` (square metres).

    Only affects Polygon / MultiPolygon geometries. The tolerance defaults
    to ``settings.SLIVER_TOLERANCE_SQM`` (1 cm²).
    """
    if geom is None or geom.is_empty:
        return geom
    if tolerance_sqm is None:
        tolerance_sqm = get_settings().SLIVER_TOLERANCE_SQM

    if isinstance(geom, Polygon):
        if geom.area < tolerance_sqm:
            return None
        return geom

    if isinstance(geom, MultiPolygon):
        kept = [p for p in geom.geoms if p.area >= tolerance_sqm]
        if not kept:
            return None
        if len(kept) == 1:
            return kept[0]
        return MultiPolygon(kept)

    # GeometryCollection or other — extract polygonal parts and filter
    normalized = normalize_geometry(geom)
    if normalized is None:
        return None
    return remove_slivers(normalized, tolerance_sqm)


def area_sqm(geom: BaseGeometry | None) -> float:
    """Return the area in square metres.

    The geometry **must** be in a projected CRS (e.g. EPSG:32614) for this to
    be meaningful. Returns ``0.0`` for ``None`` or empty geometries.
    """
    if geom is None or geom.is_empty:
        return 0.0
    return float(geom.area)


def sqm_to_acres(sqm: float) -> float:
    """Convert square metres to acres using the exact divisor ``4046.8564224``."""
    return sqm / 4046.8564224


def clip_to_parcel(geom: BaseGeometry | None, parcel: BaseGeometry | None) -> BaseGeometry | None:
    """Clip ``geom`` to the parcel bounds via intersection."""
    if geom is None or parcel is None:
        return None
    result = safe_intersection(geom, parcel)
    if result is None or result.is_empty:
        return None
    return result
