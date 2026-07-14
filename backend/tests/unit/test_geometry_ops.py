"""Comprehensive unit tests for geometry operations.

All tests use synthetic geometries in EPSG:32614 (UTM Zone 14N) with
analytically known areas, so assertions can be exact.
"""

from __future__ import annotations

import pytest
from shapely.geometry import Polygon, box

from app.geometry.ops import (
    area_sqm,
    buffer_geometry,
    clip_to_parcel,
    normalize_geometry,
    remove_slivers,
    repair_geometry,
    safe_difference,
    safe_intersection,
    safe_union,
    sqm_to_acres,
)
from app.geometry.serialization import geojson_to_shapely, to_geojson_dict


class TestNormalizeGeometry:
    def test_polygon_returns_polygon(self, square_100m: Polygon) -> None:
        result = normalize_geometry(square_100m)
        assert result is not None
        assert result.is_valid
        assert area_sqm(result) == pytest.approx(10000, abs=0.01)

    def test_none_returns_none(self) -> None:
        assert normalize_geometry(None) is None

    def test_empty_returns_none(self) -> None:
        assert normalize_geometry(Polygon()) is None

    def test_invalid_self_intersection_repaired(self) -> None:
        # Create a bowtie (self-intersecting) polygon
        bowtie = Polygon([(0, 0), (10, 10), (10, 0), (0, 10), (0, 0)])
        assert not bowtie.is_valid
        result = normalize_geometry(bowtie)
        assert result is not None
        assert result.is_valid

    def test_geometry_collection_extracts_polygons(self) -> None:
        from shapely.geometry import GeometryCollection, Point

        gc = GeometryCollection([Point(0, 0), box(0, 0, 10, 10)])
        result = normalize_geometry(gc)
        assert result is not None
        assert area_sqm(result) == pytest.approx(100, abs=0.01)


class TestRepairGeometry:
    def test_valid_geometry_unchanged(self, square_100m: Polygon) -> None:
        result = repair_geometry(square_100m)
        assert result.is_valid
        assert result.equals(square_100m)

    def test_invalid_repaired(self) -> None:
        bowtie = Polygon([(0, 0), (10, 10), (10, 0), (0, 10), (0, 0)])
        result = repair_geometry(bowtie)
        assert result.is_valid


class TestBufferGeometry:
    def test_zero_buffer_unchanged(self, square_100m: Polygon) -> None:
        result = buffer_geometry(square_100m, 0)
        assert result.equals(square_100m)

    def test_negative_buffer_unchanged(self, square_100m: Polygon) -> None:
        result = buffer_geometry(square_100m, -5)
        assert result.equals(square_100m)

    def test_positive_buffer_increases_area(self, square_100m: Polygon) -> None:
        result = buffer_geometry(square_100m, 10)
        assert area_sqm(result) > area_sqm(square_100m)
        # 100x100 square + 10m buffer: area = 100*100 + 4*10*100 + pi*10^2
        # = 10000 + 4000 + 314.16 = 14314.16
        assert area_sqm(result) == pytest.approx(14314.16, abs=1.0)


class TestSafeIntersection:
    def test_none_returns_none(self) -> None:
        assert safe_intersection(None, box(0, 0, 10, 10)) is None
        assert safe_intersection(box(0, 0, 10, 10), None) is None

    def test_overlapping(self, square_100m: Polygon, half_parcel_left: Polygon) -> None:
        # square_100m (100x100 at origin) is fully inside half_parcel_left (100x200)
        result = safe_intersection(square_100m, half_parcel_left)
        assert result is not None
        assert area_sqm(result) == pytest.approx(10000, abs=0.01)

    def test_partial_overlap(self, square_100m: Polygon, make_polygon_at) -> None:
        # square_100m at origin (0,0,100,100), another square at (50,50,100,100)
        # intersection = 50x50 = 2500
        other = make_polygon_at(50, 50, 100, 100)
        result = safe_intersection(square_100m, other)
        assert result is not None
        assert area_sqm(result) == pytest.approx(2500, abs=0.01)

    def test_disjoint(self, square_100m: Polygon, outside_parcel: Polygon) -> None:
        result = safe_intersection(square_100m, outside_parcel)
        assert result is not None
        assert result.is_empty


class TestSafeUnion:
    def test_empty_list_returns_none(self) -> None:
        assert safe_union([]) is None

    def test_single_geometry(self, square_100m: Polygon) -> None:
        result = safe_union([square_100m])
        assert result is not None
        assert area_sqm(result) == pytest.approx(10000, abs=0.01)

    def test_two_disjoint(self, half_parcel_left: Polygon, half_parcel_right: Polygon) -> None:
        result = safe_union([half_parcel_left, half_parcel_right])
        assert result is not None
        assert area_sqm(result) == pytest.approx(40000, abs=0.01)

    def test_overlapping(self, square_100m: Polygon, half_parcel_left: Polygon) -> None:
        # square_100m (100x100) is fully inside half_parcel_left (100x200)
        # so union = half_parcel_left = 20000
        result = safe_union([square_100m, half_parcel_left])
        assert result is not None
        assert area_sqm(result) == pytest.approx(20000, abs=0.01)

    def test_partial_overlap_union(self, square_100m: Polygon, make_polygon_at) -> None:
        # square_100m at origin (0,0,100,100), another square at (50,50,100,100)
        # union = 10000 + 10000 - 2500 = 17500
        other = make_polygon_at(50, 50, 100, 100)
        result = safe_union([square_100m, other])
        assert result is not None
        assert area_sqm(result) == pytest.approx(17500, abs=0.01)


class TestSafeDifference:
    def test_none_a_returns_none(self) -> None:
        assert safe_difference(None, box(0, 0, 10, 10)) is None

    def test_none_b_returns_a(self, square_100m: Polygon) -> None:
        result = safe_difference(square_100m, None)
        assert result.equals(square_100m)

    def test_empty_b_returns_a(self, square_100m: Polygon) -> None:
        result = safe_difference(square_100m, Polygon())
        assert result.equals(square_100m)

    def test_subtract_half(self, square_200m: Polygon, half_parcel_left: Polygon) -> None:
        result = safe_difference(square_200m, half_parcel_left)
        assert result is not None
        assert area_sqm(result) == pytest.approx(20000, abs=0.01)


class TestRemoveSlivers:
    def test_none_returns_none(self) -> None:
        assert remove_slivers(None) is None

    def test_empty_returns_empty(self) -> None:
        geom = Polygon()
        result = remove_slivers(geom)
        assert result is not None
        assert result.is_empty

    def test_large_polygon_kept(self, square_100m: Polygon) -> None:
        result = remove_slivers(square_100m, tolerance_sqm=1.0)
        assert result is not None
        assert area_sqm(result) == pytest.approx(10000, abs=0.01)

    def test_small_polygon_removed(self) -> None:
        # 0.5 m × 0.5 m = 0.25 m² — above default tolerance (0.01 m²)
        # Need something smaller: 0.05 m × 0.05 m = 0.0025 m²
        tiny = box(0, 0, 0.05, 0.05)
        result = remove_slivers(tiny, tolerance_sqm=0.01)
        assert result is None

    def test_multipolygon_filters_small_parts(self) -> None:
        from shapely.geometry import MultiPolygon

        big = box(0, 0, 100, 100)
        tiny = box(200, 200, 200.05, 200.05)
        mp = MultiPolygon([big, tiny])
        result = remove_slivers(mp, tolerance_sqm=0.01)
        assert result is not None
        assert area_sqm(result) == pytest.approx(10000, abs=0.01)

    def test_all_parts_removed_returns_none(self) -> None:
        from shapely.geometry import MultiPolygon

        tiny1 = box(0, 0, 0.05, 0.05)
        tiny2 = box(1, 1, 1.05, 1.05)
        mp = MultiPolygon([tiny1, tiny2])
        result = remove_slivers(mp, tolerance_sqm=0.01)
        assert result is None


class TestAreaSqm:
    def test_none_returns_zero(self) -> None:
        assert area_sqm(None) == 0.0

    def test_empty_returns_zero(self) -> None:
        assert area_sqm(Polygon()) == 0.0

    def test_known_square(self, square_100m: Polygon) -> None:
        assert area_sqm(square_100m) == pytest.approx(10000, abs=0.01)

    def test_known_large_square(self, square_1000m: Polygon) -> None:
        assert area_sqm(square_1000m) == pytest.approx(1000000, abs=1.0)


class TestSqmToAcres:
    def test_zero(self) -> None:
        assert sqm_to_acres(0) == 0.0

    def test_one_acre(self) -> None:
        assert sqm_to_acres(4046.8564224) == pytest.approx(1.0, abs=1e-10)

    def test_known_values(self) -> None:
        # 10,000 m² ≈ 2.471 acres
        assert sqm_to_acres(10000) == pytest.approx(2.47105, abs=0.001)

    def test_exact_divisor(self) -> None:
        # Verify the exact divisor is 4046.8564224
        assert sqm_to_acres(4046.8564224 * 10) == pytest.approx(10.0, abs=1e-9)

    def test_round_trip(self) -> None:
        sqm = 12345.678
        acres = sqm_to_acres(sqm)
        assert acres * 4046.8564224 == pytest.approx(sqm, abs=1e-6)


class TestClipToParcel:
    def test_none_geom(self, square_100m: Polygon) -> None:
        assert clip_to_parcel(None, square_100m) is None

    def test_none_parcel(self, square_100m: Polygon) -> None:
        assert clip_to_parcel(square_100m, None) is None

    def test_clipping(self, square_200m: Polygon, half_parcel_left: Polygon) -> None:
        result = clip_to_parcel(half_parcel_left, square_200m)
        assert result is not None
        assert area_sqm(result) == pytest.approx(20000, abs=0.01)

    def test_outside_returns_none(self, square_100m: Polygon, outside_parcel: Polygon) -> None:
        result = clip_to_parcel(outside_parcel, square_100m)
        assert result is None


class TestSerialization:
    def test_to_geojson_dict_roundtrip(self, square_100m: Polygon) -> None:
        geojson = to_geojson_dict(square_100m)
        assert geojson is not None
        assert geojson["type"] == "Polygon"
        result = geojson_to_shapely(geojson)
        assert result is not None
        assert result.equals(square_100m)

    def test_to_geojson_dict_none(self) -> None:
        assert to_geojson_dict(None) is None

    def test_to_geojson_dict_empty(self) -> None:
        assert to_geojson_dict(Polygon()) is None

    def test_geojson_to_shapely_empty(self) -> None:
        assert geojson_to_shapely({}) is None

    def test_geojson_to_shapely_none(self) -> None:
        assert geojson_to_shapely(None) is None
