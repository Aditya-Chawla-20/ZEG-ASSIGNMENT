"""Unit tests for AnalysisService using mocked repositories.

These tests exercise the analysis pipeline logic without a database. The
mock repositories return pre-built Shapely geometries in EPSG:32614.

Test coverage:
1. No constraints — buildable equals parcel
2. Constraint outside parcel — no exclusion
3. Full parcel coverage — buildable is zero
4. Overlapping constraints — not double counted
5. Manual exclusion
6. Manual restoration
7. Restoration outside exclusion — no effect beyond original
8. Manual geometry partly outside parcel — clipped
9. Invalid self-intersection — repaired
10. Disabled layer
11. Zero buffer
12. Small numerical sliver removal
13. sqm_to_acres conversion accuracy
14. Area invariant check
"""

from __future__ import annotations

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from shapely.geometry import Polygon, mapping

from app.geometry.ops import area_sqm, sqm_to_acres
from app.schemas.analysis import (
    AnalysisRequest,
    ConstraintConfig,
    ManualEdits,
)
from app.services.analysis_service import AnalysisService

# ---------------------------------------------------------------------------
# Helper: build a mock parcel object that mimics the SQLAlchemy model.
# ---------------------------------------------------------------------------


class MockParcel:
    """Mimics the Parcel SQLAlchemy model for testing."""

    def __init__(self, geom: Polygon, geom_wgs84: Polygon | None = None) -> None:
        self.id = uuid4()
        self.source_id = "TEST-PARCEL"
        self.county_name = "Brazos"
        self.display_name = "Test Parcel"
        self.address = None
        self.source_area_acres = sqm_to_acres(area_sqm(geom))
        self.geometry = geom  # Shapely geometry (analysis CRS)
        self.geometry_wgs84 = geom_wgs84  # Shapely geometry (WGS84)
        self.centroid_wgs84 = None
        self.properties = {}


class MockConstraintFeature:
    """Mimics the ConstraintFeature SQLAlchemy model for testing."""

    def __init__(self, geom: Polygon, layer_type: str, classification: str | None = None) -> None:
        self.id = uuid4()
        self.dataset_id = uuid4()
        self.layer_type = layer_type
        self.source_id = f"TEST-{layer_type}"
        self.classification = classification
        self.geometry = geom  # Shapely geometry (analysis CRS)
        self.properties = {}


def make_service(
    mock_parcel_repo: MagicMock,
    mock_constraint_repo: MagicMock,
) -> AnalysisService:
    """Create an AnalysisService with mocked repos."""
    return AnalysisService(mock_parcel_repo, mock_constraint_repo)


def make_request(
    parcel_id: str = "TEST-PARCEL",
    constraints: list[ConstraintConfig] | None = None,
    manual_edits: ManualEdits | None = None,
) -> AnalysisRequest:
    """Build an AnalysisRequest with defaults."""
    return AnalysisRequest(
        parcelId=parcel_id,
        constraints=constraints or [],
        manualEdits=manual_edits or ManualEdits(),
    )


def feature_collection(geom: Polygon) -> dict:
    """Wrap a Shapely geometry in a GeoJSON FeatureCollection."""
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "geometry": mapping(geom), "properties": {}}],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestNoConstraints:
    """Test 1: No constraints — buildable equals parcel."""

    def test_buildable_equals_parcel(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel
        mock_constraint_repo.get_intersecting.return_value = []

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request()
        response = service.run_analysis(request, "test-req-1")

        assert response.summary.buildable_acres == 10.0
        assert response.summary.excluded_acres == pytest.approx(0.0, abs=1e-6)
        assert response.summary.buildable_percentage == pytest.approx(100.0, abs=0.01)


class TestConstraintOutsideParcel:
    """Test 2: Constraint outside parcel — no exclusion."""

    def test_outside_constraint_no_exclusion(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        outside_parcel: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel
        mock_constraint_repo.get_intersecting.return_value = []

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)]
        )
        response = service.run_analysis(request, "test-req-2")

        assert response.summary.excluded_acres == pytest.approx(0.0, abs=1e-6)
        assert response.summary.buildable_acres == 10.0


class TestFullParcelCoverage:
    """Test 3: Full parcel coverage — buildable is zero."""

    def test_full_coverage(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        # Constraint covers the entire parcel
        full_coverage = MockConstraintFeature(square_200m, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [full_coverage]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)]
        )
        response = service.run_analysis(request, "test-req-3")

        assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(40000), abs=1e-6)
        assert response.summary.buildable_acres == pytest.approx(0.0, abs=1e-6)
        assert response.summary.buildable_percentage == pytest.approx(0.0, abs=0.01)


class TestOverlappingConstraints:
    """Test 4: Overlapping constraints — not double counted."""

    def test_overlapping_not_double_counted(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
        half_parcel_bottom: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        # Two constraints: left half and bottom half — they overlap in the
        # bottom-left quadrant (100x100 = 10000 m²).
        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        flood_feat = MockConstraintFeature(half_parcel_bottom, "floodplain")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat, flood_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[
                ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0),
                ConstraintConfig(type="floodplain", enabled=True, bufferMeters=0),
            ]
        )
        response = service.run_analysis(request, "test-req-4")

        # Total excluded = union of left + bottom = 20000 + 20000 - 10000 = 30000
        assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(30000), abs=1e-6)
        assert response.summary.buildable_acres == 3.0

        # Breakdown: wetlands gets full 20000, floodplain gets unique 10000
        wetland_item = next(b for b in response.breakdown if b.constraint_type == "wetlands")
        flood_item = next(b for b in response.breakdown if b.constraint_type == "floodplain")
        assert wetland_item.uniquely_removed_acres == pytest.approx(sqm_to_acres(20000), abs=1e-6)
        assert flood_item.uniquely_removed_acres == pytest.approx(sqm_to_acres(10000), abs=1e-6)

        # Sum of unique removals = total excluded
        total_unique = sum(b.uniquely_removed_acres for b in response.breakdown)
        assert total_unique == pytest.approx(response.summary.excluded_acres, abs=1e-6)


class TestManualExclusion:
    """Test 5: Manual exclusion."""

    def test_manual_exclusion(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        quarter_parcel: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel
        mock_constraint_repo.get_intersecting.return_value = []

        # Manual exclusion covering the top-left quarter (10000 m²).
        # We need to provide it in WGS84 GeoJSON, but since we're testing
        # in EPSG:32614, we'll mock to_analysis_crs to be identity.
        import app.services.analysis_service as svc_mod

        original_to_analysis_crs = svc_mod.to_analysis_crs
        svc_mod.to_analysis_crs = lambda g, from_crs="EPSG:4326": g

        try:
            manual_edits = ManualEdits(exclusions=feature_collection(quarter_parcel))
            request = make_request(manual_edits=manual_edits)
            service = make_service(mock_parcel_repo, mock_constraint_repo)
            response = service.run_analysis(request, "test-req-5")

            assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(10000), abs=1e-6)
            assert response.summary.buildable_acres == 8.0
        finally:
            svc_mod.to_analysis_crs = original_to_analysis_crs


class TestManualRestoration:
    """Test 6: Manual restoration."""

    def test_manual_restoration(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
        quarter_parcel: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        # Wetlands covers left half (20000 m²)
        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        import app.services.analysis_service as svc_mod

        original_to_analysis_crs = svc_mod.to_analysis_crs
        svc_mod.to_analysis_crs = lambda g, from_crs="EPSG:4326": g

        try:
            # Restore the top-left quarter (10000 m²) from the wetland exclusion
            manual_edits = ManualEdits(restorations=feature_collection(quarter_parcel))
            request = make_request(
                constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)],
                manual_edits=manual_edits,
            )
            service = make_service(mock_parcel_repo, mock_constraint_repo)
            response = service.run_analysis(request, "test-req-6")

            # Excluded = 20000 - 10000 = 10000
            assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(10000), abs=1e-6)
            assert response.summary.buildable_acres == 8.0
        finally:
            svc_mod.to_analysis_crs = original_to_analysis_crs


class TestRestorationOutsideExclusion:
    """Test 7: Restoration outside exclusion — no effect beyond original."""

    def test_restoration_outside_exclusion(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
        half_parcel_right: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        # Wetlands covers left half only
        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        import app.services.analysis_service as svc_mod

        original_to_analysis_crs = svc_mod.to_analysis_crs
        svc_mod.to_analysis_crs = lambda g, from_crs="EPSG:4326": g

        try:
            # Try to restore the right half (which is NOT excluded)
            manual_edits = ManualEdits(restorations=feature_collection(half_parcel_right))
            request = make_request(
                constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)],
                manual_edits=manual_edits,
            )
            service = make_service(mock_parcel_repo, mock_constraint_repo)
            response = service.run_analysis(request, "test-req-7")

            # Excluded should still be 20000 (restoration outside exclusion
            # has no effect on the effective exclusion)
            assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(20000), abs=1e-6)
            assert response.summary.buildable_acres == 5.0
        finally:
            svc_mod.to_analysis_crs = original_to_analysis_crs


class TestManualGeometryClipped:
    """Test 8: Manual geometry partly outside parcel — clipped."""

    def test_manual_exclusion_clipped(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        make_polygon_at,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel
        mock_constraint_repo.get_intersecting.return_value = []

        # Manual exclusion that extends beyond the parcel (starts at x=150,
        # extends to x=250, but parcel ends at x=200). Only the 50x200 part
        # inside the parcel should be excluded (10000 m²).
        outside_exclusion = make_polygon_at(150, 0, 100, 200)

        import app.services.analysis_service as svc_mod

        original_to_analysis_crs = svc_mod.to_analysis_crs
        svc_mod.to_analysis_crs = lambda g, from_crs="EPSG:4326": g

        try:
            manual_edits = ManualEdits(exclusions=feature_collection(outside_exclusion))
            request = make_request(manual_edits=manual_edits)
            service = make_service(mock_parcel_repo, mock_constraint_repo)
            response = service.run_analysis(request, "test-req-8")

            # Only 50m × 200m = 10000 m² should be excluded (clipped to parcel)
            assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(10000), abs=1e-6)
            assert response.summary.buildable_acres == 8.0
        finally:
            svc_mod.to_analysis_crs = original_to_analysis_crs


class TestInvalidGeometryRepaired:
    """Test 9: Invalid self-intersection — repaired."""

    def test_invalid_constraint_repaired(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        origin: tuple[float, float],
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        # Create a bowtie (self-intersecting) polygon that overlaps the parcel.
        # Use coordinates relative to the origin so it actually intersects.
        ox, oy = origin
        bowtie = Polygon(
            [
                (ox + 50, oy + 50),
                (ox + 150, oy + 150),
                (ox + 150, oy + 50),
                (ox + 50, oy + 150),
                (ox + 50, oy + 50),
            ]
        )
        assert not bowtie.is_valid

        wetland_feat = MockConstraintFeature(bowtie, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)]
        )
        # Should not raise — the geometry is repaired internally
        response = service.run_analysis(request, "test-req-9")

        # The repaired bowtie should cover some area within the parcel
        assert response.summary.excluded_acres > 0
        assert response.summary.buildable_acres < response.summary.parcel_acres


class TestDisabledLayer:
    """Test 10: Disabled layer."""

    def test_disabled_layer_no_exclusion(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=False, bufferMeters=0)]
        )
        response = service.run_analysis(request, "test-req-10")

        # Disabled layer should not contribute to exclusion
        assert response.summary.excluded_acres == pytest.approx(0.0, abs=1e-6)
        assert response.summary.buildable_acres == 10.0

        # Breakdown should show enabled=False
        wetland_item = next(b for b in response.breakdown if b.constraint_type == "wetlands")
        assert wetland_item.enabled is False


class TestZeroBuffer:
    """Test 11: Zero buffer."""

    def test_zero_buffer(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)]
        )
        response = service.run_analysis(request, "test-req-11")

        # Without buffer, excluded = 20000
        assert response.summary.excluded_acres == pytest.approx(sqm_to_acres(20000), abs=1e-6)


class TestSliverRemoval:
    """Test 12: Small numerical sliver removal."""

    def test_sliver_removed(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        make_polygon_at,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        # A tiny sliver (0.001 m²) inside the parcel
        sliver = make_polygon_at(50, 50, 0.001, 0.001)
        wetland_feat = MockConstraintFeature(sliver, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)]
        )
        response = service.run_analysis(request, "test-req-12")

        # The sliver should be removed, so excluded = 0
        assert response.summary.excluded_acres == pytest.approx(0.0, abs=1e-6)
        assert response.summary.buildable_acres == 10.0


class TestSqmToAcresAccuracy:
    """Test 13: sqm_to_acres conversion accuracy."""

    def test_accurate_conversion(self) -> None:
        # 4046.8564224 m² = 1 acre exactly
        assert sqm_to_acres(4046.8564224) == pytest.approx(1.0, abs=1e-10)
        assert sqm_to_acres(40468.564224) == pytest.approx(10.0, abs=1e-9)
        assert sqm_to_acres(0) == 0.0

    def test_response_uses_accurate_conversion(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel
        mock_constraint_repo.get_intersecting.return_value = []

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request()
        response = service.run_analysis(request, "test-req-13")

        # 40000 m² = 40000 / 4046.8564224 acres
        expected_acres = 40000 / 4046.8564224
        assert response.summary.parcel_acres == pytest.approx(expected_acres, abs=1e-6)


class TestAreaInvariant:
    """Test 14: Area invariant check — parcel ≈ buildable + excluded."""

    def test_invariant_holds(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
    ) -> None:
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0)]
        )
        response = service.run_analysis(request, "test-req-14")

        # parcel = buildable + excluded (within tolerance, accounting for buildable rounded up)
        import math

        expected_buildable_acres = sqm_to_acres(20000)
        assert response.summary.buildable_acres == float(math.ceil(expected_buildable_acres))

        # No invariant warning should be present
        invariant_warnings = [w for w in response.warnings if "invariant" in w.lower()]
        assert len(invariant_warnings) == 0

    def test_breakdown_sum_equals_excluded(
        self,
        mock_parcel_repo: MagicMock,
        mock_constraint_repo: MagicMock,
        square_200m: Polygon,
        half_parcel_left: Polygon,
        half_parcel_bottom: Polygon,
    ) -> None:
        """The sum of uniquely_removed_acres equals excluded_acres."""
        parcel = MockParcel(square_200m)
        mock_parcel_repo.get_by_id.return_value = parcel

        wetland_feat = MockConstraintFeature(half_parcel_left, "wetlands")
        flood_feat = MockConstraintFeature(half_parcel_bottom, "floodplain")
        mock_constraint_repo.get_intersecting.return_value = [wetland_feat, flood_feat]

        service = make_service(mock_parcel_repo, mock_constraint_repo)
        request = make_request(
            constraints=[
                ConstraintConfig(type="wetlands", enabled=True, bufferMeters=0),
                ConstraintConfig(type="floodplain", enabled=True, bufferMeters=0),
            ]
        )
        response = service.run_analysis(request, "test-req-14b")

        total_unique = sum(b.uniquely_removed_acres for b in response.breakdown)
        assert total_unique == pytest.approx(response.summary.excluded_acres, abs=1e-6)
