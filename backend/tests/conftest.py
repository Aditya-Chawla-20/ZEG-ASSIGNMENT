"""Shared pytest fixtures.

Provides synthetic geometries in EPSG:32614 (UTM Zone 14N) with analytically
known areas, so tests can assert exact area values without floating-point
ambiguity from CRS transforms.
"""

from __future__ import annotations

import pytest
from shapely.geometry import Polygon, box

# A fixed origin in UTM Zone 14N (metres). Using round numbers makes area
# calculations exact.
ORIGIN_X = 200000.0  # easting
ORIGIN_Y = 3360000.0  # northing


@pytest.fixture
def origin() -> tuple[float, float]:
    """Return a fixed UTM origin (easting, northing) in metres."""
    return (ORIGIN_X, ORIGIN_Y)


@pytest.fixture
def square_100m(origin: tuple[float, float]) -> Polygon:
    """A 100 m × 100 m square (10,000 m²) in EPSG:32614."""
    ox, oy = origin
    return box(ox, oy, ox + 100, oy + 100)


@pytest.fixture
def square_200m(origin: tuple[float, float]) -> Polygon:
    """A 200 m × 200 m square (40,000 m²) in EPSG:32614."""
    ox, oy = origin
    return box(ox, oy, ox + 200, oy + 200)


@pytest.fixture
def square_1000m(origin: tuple[float, float]) -> Polygon:
    """A 1000 m × 1000 m square (1,000,000 m²) in EPSG:32614."""
    ox, oy = origin
    return box(ox, oy, ox + 1000, oy + 1000)


@pytest.fixture
def half_parcel_left(origin: tuple[float, float]) -> Polygon:
    """Left half of a 200 m square (20,000 m²)."""
    ox, oy = origin
    return box(ox, oy, ox + 100, oy + 200)


@pytest.fixture
def half_parcel_right(origin: tuple[float, float]) -> Polygon:
    """Right half of a 200 m square (20,000 m²)."""
    ox, oy = origin
    return box(ox + 100, oy, ox + 200, oy + 200)


@pytest.fixture
def half_parcel_bottom(origin: tuple[float, float]) -> Polygon:
    """Bottom half of a 200 m square (20,000 m²)."""
    ox, oy = origin
    return box(ox, oy, ox + 200, oy + 100)


@pytest.fixture
def outside_parcel(origin: tuple[float, float]) -> Polygon:
    """A 50 m × 50 m square far outside the parcel (offset by 5000 m)."""
    ox, oy = origin
    return box(ox + 5000, oy + 5000, ox + 5050, oy + 5050)


@pytest.fixture
def quarter_parcel(origin: tuple[float, float]) -> Polygon:
    """Top-left quarter of a 200 m square (10,000 m²)."""
    ox, oy = origin
    return box(ox, oy + 100, ox + 100, oy + 200)


@pytest.fixture
def make_polygon_at(origin: tuple[float, float]):
    """Factory: create a box at (ox+dx, oy+dy) with given width/height."""
    ox, oy = origin

    def _make(dx: float, dy: float, width: float, height: float) -> Polygon:
        return box(ox + dx, oy + dy, ox + dx + width, oy + dy + height)

    return _make


@pytest.fixture
def manual_exclusion_geojson(origin: tuple[float, float]) -> dict:
    """A manual exclusion polygon in WGS84 GeoJSON (small square near origin).

    Since tests run in EPSG:32614, we provide a GeoJSON polygon whose
    coordinates are the WGS84 equivalent of a 50 m × 50 m square at the
    parcel origin. For testing purposes we use a tiny lat/lon box.
    """
    # Use a very small WGS84 box that maps to roughly the parcel area.
    # In tests, we'll mock the CRS transform or use analysis-CRS coords directly.
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-96.33, 30.63],
                            [-96.329, 30.63],
                            [-96.329, 30.631],
                            [-96.33, 30.631],
                            [-96.33, 30.63],
                        ]
                    ],
                },
                "properties": {},
            }
        ],
    }


@pytest.fixture
def empty_feature_collection() -> dict:
    return {"type": "FeatureCollection", "features": []}


@pytest.fixture
def mock_parcel_repo():
    """A mock ParcelRepository for AnalysisService tests."""
    from unittest.mock import MagicMock

    repo = MagicMock()
    return repo


@pytest.fixture
def mock_constraint_repo():
    """A mock ConstraintRepository for AnalysisService tests."""
    from unittest.mock import MagicMock

    repo = MagicMock()
    return repo
