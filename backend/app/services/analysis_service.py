"""Core analysis service.

Implements the buildable-land analysis pipeline:

1. Load parcel geometry (analysis CRS).
2. Load candidate constraint features via spatial pre-filter.
3. Build per-layer buffered + clipped geometries.
4. Parse manual exclusion / restoration polygons.
5. Compute effective exclusion using the spec's geometry semantics:
   - system_exclusion = union(C_i intersect P)   [already clipped]
   - combined_exclusion = union(system_exclusion, M_exclude)
   - effective_exclusion = difference(combined_exclusion, M_restore)
   - effective_exclusion = intersection(effective_exclusion, P)
   - buildable = difference(P, effective_exclusion)
6. Compute areas (always in projected CRS EPSG:32614).
7. Compute non-double-counted breakdown (ordered unique attribution).
8. Serialize geometries to WGS84 GeoJSON.

All area calculations use the projected CRS (EPSG:32614), never EPSG:4326
or EPSG:3857. ``sqm_to_acres`` uses exactly ``4046.8564224`` as the divisor.
"""

from __future__ import annotations

import time

from shapely.geometry import MultiPolygon
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform
from pyproj import Transformer

from app.core.config import get_settings
from app.core.exceptions import ParcelNotFoundError
from app.core.logging import get_logger
from app.geometry.crs import to_analysis_crs, to_wgs84
from app.geometry.ops import (
    area_sqm,
    buffer_geometry,
    clip_to_parcel,
    normalize_geometry,
    remove_slivers,
    safe_difference,
    safe_intersection,
    safe_union,
    sqm_to_acres,
)
from app.geometry.serialization import geojson_to_shapely, geometry_from_wkb, to_geojson_dict
from app.schemas.analysis import (
    AnalysisGeometry,
    AnalysisMetrics,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisSummary,
    BreakdownItem,
)

logger = get_logger(__name__)

CONSTRAINT_LABELS = {
    "wetlands": "Wetlands + setback",
    "floodplain": "FEMA flood hazard",
    "transmission": "Transmission line corridor",
    "manual_exclusion": "Manual exclusion",
}

CONSTRAINT_REASONS = {
    "wetlands": (
        "USFWS National Wetlands Inventory polygons with configurable planning buffer. "
        "Buffer is a screening assumption, not a universal legal setback."
    ),
    "floodplain": (
        "FEMA National Flood Hazard Layer polygons for selected flood-zone classifications."
    ),
    "transmission": (
        "HIFLD electric transmission line corridor. Buffer is a planning assumption, "
        "not a verified easement width."
    ),
    "manual_exclusion": "User-drawn manual exclusion polygon.",
}


class AnalysisService:
    """Runs the buildable-land analysis for a single parcel."""

    def __init__(self, parcel_repo, constraint_repo) -> None:
        self.parcel_repo = parcel_repo
        self.constraint_repo = constraint_repo
        self.settings = get_settings()

    def run_analysis(self, request: AnalysisRequest, request_id: str) -> AnalysisResponse:
        start_ms = time.monotonic() * 1000
        logger.info("analysis_start", request_id=request_id, parcel_id=request.parcel_id)

        # 1. Load parcel
        parcel = self.parcel_repo.get_by_id(request.parcel_id)
        if parcel is None:
            raise ParcelNotFoundError(f"Parcel {request.parcel_id} not found")

        parcel_geom = geometry_from_wkb(parcel.geometry)
        parcel_geom = to_analysis_crs(parcel_geom, from_crs="EPSG:32614")
        parcel_geom = normalize_geometry(parcel_geom)
        if parcel_geom is None or parcel_geom.is_empty:
            raise ParcelNotFoundError(f"Parcel {request.parcel_id} has no valid geometry")

        parcel_area_sqm = area_sqm(parcel_geom)
        parcel_acres = sqm_to_acres(parcel_area_sqm)

        warnings: list[str] = []

        # 2. Load and buffer constraint features
        enabled_constraints = [c for c in request.constraints if c.enabled]
        enabled_types = [c.type for c in enabled_constraints]

        # Expand envelope by max buffer for pre-filtering
        max_buffer = max((c.buffer_meters for c in enabled_constraints), default=0.0)
        envelope = parcel_geom.envelope.buffer(max_buffer + 100)

        # Transform envelope and parcel geom back to database native CRS (EPSG:32614) for querying
        from pyproj import Transformer
        from shapely.ops import transform

        to_db_transformer = Transformer.from_crs(
            self.settings.ANALYSIS_CRS, "EPSG:32614", always_xy=True
        )
        parcel_geom_db = transform(to_db_transformer.transform, parcel_geom)
        envelope_db = transform(to_db_transformer.transform, envelope)

        parcel_geom_wkt = parcel_geom_db.wkt
        envelope_wkt = envelope_db.wkt

        candidate_features = self.constraint_repo.get_intersecting(
            parcel_geom_wkt=parcel_geom_wkt,
            envelope_wkt=envelope_wkt,
            layer_types=enabled_types if enabled_types else [],
        )

        logger.info(
            "constraint_features_loaded",
            count=len(candidate_features),
            request_id=request_id,
        )

        # 3. Build per-layer buffered+clipped geometries
        layer_geometries: dict[str, BaseGeometry | None] = {}
        layer_dataset_ids: dict[str, str | None] = {}

        for cfg in request.constraints:
            if not cfg.enabled:
                layer_geometries[cfg.type] = None
                continue

            relevant = [f for f in candidate_features if f.layer_type == cfg.type]

            # Filter by classification if requested
            if cfg.classifications:
                relevant = [
                    f
                    for f in relevant
                    if f.classification and f.classification in cfg.classifications
                ]

            if not relevant and cfg.type == "wetlands":
                # --- Live USFWS NWI fallback ---
                # No wetland features in DB for this parcel; fetch from USFWS.
                logger.info(
                    "wetlands_live_fallback",
                    request_id=request_id,
                    reason="no_db_features",
                )
                layer_geometries[cfg.type] = self._fetch_live_wetlands(
                    parcel_geom, cfg.buffer_meters, warnings
                )
                layer_dataset_ids[cfg.type] = None
                continue
            elif not relevant:
                layer_geometries[cfg.type] = None
                layer_dataset_ids[cfg.type] = None
                continue

            # Get dataset id from first feature
            layer_dataset_ids[cfg.type] = str(relevant[0].dataset_id)

            # Union all features in this layer
            feature_geoms: list[BaseGeometry] = []
            for f in relevant:
                geom = geometry_from_wkb(f.geometry)
                if geom is None:
                    continue
                geom = normalize_geometry(geom)
                if geom is None:
                    continue
                # Transform from DB CRS (EPSG:32614) to analysis CRS
                geom = to_analysis_crs(geom, from_crs="EPSG:32614")
                if cfg.buffer_meters > 0:
                    geom = buffer_geometry(geom, cfg.buffer_meters)
                feature_geoms.append(geom)

            if not feature_geoms:
                layer_geometries[cfg.type] = None
                continue

            layer_union = safe_union(feature_geoms)
            if layer_union is None or layer_union.is_empty:
                layer_geometries[cfg.type] = None
                continue

            # Clip to parcel
            clipped = clip_to_parcel(layer_union, parcel_geom)
            layer_geometries[cfg.type] = clipped

        # 4. Parse manual edits
        manual_exclusion_geom = self._parse_manual_geoms(
            request.manual_edits.exclusions, parcel_geom, "manual exclusion", warnings
        )
        manual_restoration_geom = self._parse_manual_geoms(
            request.manual_edits.restorations, parcel_geom, "manual restoration", warnings
        )

        # 5. Compute effective exclusion using geometry semantics from spec:
        #    system_exclusion = union(C_i intersect P)  [already clipped above]
        #    combined_exclusion = union(system_exclusion, M_exclude)
        #    effective_exclusion = difference(combined_exclusion, M_restore)
        #    effective_exclusion = intersection(effective_exclusion, P)
        #    buildable = difference(P, effective_exclusion)
        system_geoms = [g for g in layer_geometries.values() if g is not None and not g.is_empty]
        system_exclusion = safe_union(system_geoms)

        all_exclusion_geoms: list[BaseGeometry] = []
        if system_exclusion and not system_exclusion.is_empty:
            all_exclusion_geoms.append(system_exclusion)
        if manual_exclusion_geom and not manual_exclusion_geom.is_empty:
            all_exclusion_geoms.append(manual_exclusion_geom)

        combined_exclusion = safe_union(all_exclusion_geoms)

        effective_exclusion: BaseGeometry | None = None
        if combined_exclusion and not combined_exclusion.is_empty:
            if manual_restoration_geom and not manual_restoration_geom.is_empty:
                effective_exclusion = safe_difference(combined_exclusion, manual_restoration_geom)
            else:
                effective_exclusion = combined_exclusion

            if effective_exclusion and not effective_exclusion.is_empty:
                effective_exclusion = safe_intersection(effective_exclusion, parcel_geom)
                effective_exclusion = (
                    normalize_geometry(effective_exclusion) if effective_exclusion else None
                )
                if effective_exclusion:
                    effective_exclusion = remove_slivers(
                        effective_exclusion, self.settings.SLIVER_TOLERANCE_SQM
                    )

        buildable = (
            safe_difference(parcel_geom, effective_exclusion)
            if effective_exclusion
            else parcel_geom
        )
        buildable = normalize_geometry(buildable) if buildable else None
        if buildable:
            buildable = remove_slivers(buildable, self.settings.SLIVER_TOLERANCE_SQM)

        # 6. Compute areas
        excluded_sqm = (
            area_sqm(effective_exclusion)
            if effective_exclusion and not effective_exclusion.is_empty
            else 0.0
        )
        buildable_sqm = area_sqm(buildable) if buildable and not buildable.is_empty else 0.0
        import math

        excluded_acres = sqm_to_acres(excluded_sqm)
        buildable_acres = float(math.ceil(sqm_to_acres(buildable_sqm)))
        buildable_pct = (buildable_sqm / parcel_area_sqm * 100) if parcel_area_sqm > 0 else 0.0

        # Validate invariant: parcel ≈ buildable + excluded
        invariant_delta = abs(parcel_area_sqm - buildable_sqm - excluded_sqm)
        if invariant_delta > self.settings.AREA_INVARIANT_TOLERANCE_SQM:
            warnings.append(
                f"Area invariant deviation: {invariant_delta:.2f} m² "
                f"(tolerance: {self.settings.AREA_INVARIANT_TOLERANCE_SQM} m²)"
            )

        if buildable_sqm < 0:
            warnings.append("Entire parcel is excluded by current constraints.")

        # 7. Non-double-counted breakdown (ordered unique attribution)
        breakdown = self._compute_breakdown(
            parcel_geom=parcel_geom,
            parcel_area_sqm=parcel_area_sqm,
            parcel_acres=parcel_acres,
            request=request,
            layer_geometries=layer_geometries,
            layer_dataset_ids=layer_dataset_ids,
            manual_exclusion_geom=manual_exclusion_geom,
            manual_restoration_geom=manual_restoration_geom,
            warnings=warnings,
        )

        # 8. Serialize geometries to WGS84 GeoJSON
        parcel_wgs84 = geometry_from_wkb(parcel.geometry_wgs84)

        exclusions_by_constraint: dict[str, dict] = {}
        for layer_type, geom in layer_geometries.items():
            if geom and not geom.is_empty:
                wgs = to_wgs84(geom)
                geojson = to_geojson_dict(wgs)
                if geojson:
                    exclusions_by_constraint[layer_type] = geojson

        duration_ms = time.monotonic() * 1000 - start_ms
        logger.info(
            "analysis_complete",
            request_id=request_id,
            duration_ms=round(duration_ms, 1),
        )

        return AnalysisResponse(
            analysis_id=request_id,
            summary=AnalysisSummary(
                parcel_acres=parcel_acres,
                excluded_acres=excluded_acres,
                buildable_acres=buildable_acres,
                buildable_percentage=buildable_pct,
            ),
            breakdown=breakdown,
            geometry=AnalysisGeometry(
                parcel=(
                    to_geojson_dict(parcel_wgs84)
                    if parcel_wgs84
                    else to_geojson_dict(to_wgs84(parcel_geom))
                ),
                buildable=(
                    to_geojson_dict(to_wgs84(buildable))
                    if buildable and not buildable.is_empty
                    else None
                ),
                excluded=(
                    to_geojson_dict(to_wgs84(effective_exclusion))
                    if effective_exclusion and not effective_exclusion.is_empty
                    else None
                ),
                exclusions_by_constraint=exclusions_by_constraint,
                manual_exclusions=(
                    to_geojson_dict(to_wgs84(manual_exclusion_geom))
                    if manual_exclusion_geom and not manual_exclusion_geom.is_empty
                    else None
                ),
                manual_restorations=(
                    to_geojson_dict(to_wgs84(manual_restoration_geom))
                    if manual_restoration_geom and not manual_restoration_geom.is_empty
                    else None
                ),
            ),
            warnings=warnings,
            metrics=AnalysisMetrics(
                analysis_duration_ms=round(duration_ms, 1),
                candidate_constraint_features=len(candidate_features),
            ),
        )

    def _fetch_live_wetlands(
        self,
        parcel_geom: "BaseGeometry",
        buffer_meters: float,
        warnings: list[str],
    ) -> "BaseGeometry | None":
        """Fetch live wetland geometries from USFWS NWI REST API.

        Used as a fallback when the database has no wetland features for the
        parcel (e.g., the ingestion script has not been run).

        Args:
            parcel_geom: Parcel geometry in the analysis CRS.
            buffer_meters: Buffer to apply to wetland polygons.
            warnings: Warnings list to append to on failure.

        Returns:
            Unioned, buffered, clipped wetland geometry or None.
        """
        from app.services.wetlands_fetcher import fetch_wetland_geoms_for_parcel
        from app.geometry.crs import to_wgs84

        # Convert parcel to WGS84 for bbox calculation
        parcel_wgs84 = to_wgs84(parcel_geom)
        if parcel_wgs84 is None or parcel_wgs84.is_empty:
            return None

        try:
            wetland_pairs = fetch_wetland_geoms_for_parcel(parcel_wgs84)
        except Exception as exc:
            warnings.append(
                f"Live USFWS NWI fetch failed: {exc}. Wetlands excluded from analysis."
            )
            return None

        if not wetland_pairs:
            warnings.append(
                "No USFWS NWI wetland features found near this parcel. "
                "Wetlands layer has no effect on this analysis."
            )
            return None

        feature_geoms: list[BaseGeometry] = []
        for geom_utm, _wetland_type in wetland_pairs:
            geom = normalize_geometry(geom_utm)
            if geom is None:
                continue
            # Already in analysis CRS (EPSG:32614) — convert if needed
            geom = to_analysis_crs(geom, from_crs="EPSG:32614")
            if buffer_meters > 0:
                geom = buffer_geometry(geom, buffer_meters)
            feature_geoms.append(geom)

        if not feature_geoms:
            return None

        layer_union = safe_union(feature_geoms)
        if layer_union is None or layer_union.is_empty:
            return None

        warnings.append(
            "Wetland data fetched live from USFWS NWI REST API "
            "(not from local database)."
        )
        return clip_to_parcel(layer_union, parcel_geom)

    def _parse_manual_geoms(
        self,
        geojson_dict: dict,
        parcel_geom: BaseGeometry,
        label: str,
        warnings: list[str],
    ) -> BaseGeometry | None:
        """Parse GeoJSON FeatureCollection of manual polygons, clip to parcel.

        Manual polygons are assumed to be in WGS84 (EPSG:4326) and are
        transformed to the analysis CRS before clipping.
        """
        features = geojson_dict.get("features", [])
        if not features:
            return None
        geoms: list[BaseGeometry] = []
        for feat in features:
            try:
                g = geojson_to_shapely(feat.get("geometry", {}))
                g = normalize_geometry(g)
                if g is None:
                    warnings.append(f"A {label} polygon was empty after normalization.")
                    continue
                # Transform from WGS84 to analysis CRS
                g = to_analysis_crs(g)
                g = clip_to_parcel(g, parcel_geom)
                if g and not g.is_empty:
                    geoms.append(g)
            except Exception as e:
                warnings.append(f"A {label} polygon could not be parsed: {e}")
        return safe_union(geoms)

    def _compute_breakdown(
        self,
        parcel_geom: BaseGeometry,
        parcel_area_sqm: float,
        parcel_acres: float,
        request: AnalysisRequest,
        layer_geometries: dict[str, BaseGeometry | None],
        layer_dataset_ids: dict[str, str | None],
        manual_exclusion_geom: BaseGeometry | None,
        manual_restoration_geom: BaseGeometry | None,
        warnings: list[str],
    ) -> list[BreakdownItem]:
        """Ordered unique attribution.

        Assign each square metre of exclusion to exactly one constraint in
        priority order so overlaps are not double-counted. The sum of
        ``uniquely_removed_acres`` equals ``effective_excluded_acres``
        within the area invariant tolerance.
        """
        breakdown: list[BreakdownItem] = []
        remaining: BaseGeometry | None = parcel_geom

        priority_order = self.settings.CONSTRAINT_PRIORITY

        for constraint_type in priority_order:
            if constraint_type == "manual_exclusion":
                continue  # handled separately below

            cfg = next((c for c in request.constraints if c.type == constraint_type), None)
            if cfg is None:
                continue

            raw_geom = layer_geometries.get(constraint_type)

            if not cfg.enabled or raw_geom is None or raw_geom.is_empty:
                breakdown.append(
                    BreakdownItem(
                        constraint_type=constraint_type,
                        label=CONSTRAINT_LABELS.get(constraint_type, constraint_type),
                        enabled=cfg.enabled,
                        buffer_meters=cfg.buffer_meters,
                        raw_intersection_acres=0.0,
                        uniquely_removed_acres=0.0,
                        percentage_of_parcel=0.0,
                        reason=CONSTRAINT_REASONS.get(constraint_type, ""),
                        source_dataset_id=layer_dataset_ids.get(constraint_type),
                    )
                )
                continue

            raw_intersection = safe_intersection(raw_geom, parcel_geom)
            raw_sqm = (
                area_sqm(raw_intersection)
                if raw_intersection and not raw_intersection.is_empty
                else 0.0
            )

            unique_part = safe_intersection(raw_geom, remaining) if remaining is not None else None
            unique_sqm = area_sqm(unique_part) if unique_part and not unique_part.is_empty else 0.0

            if unique_part and not unique_part.is_empty and remaining is not None:
                remaining = safe_difference(remaining, unique_part)
                remaining = normalize_geometry(remaining) if remaining else None
                if remaining is None or remaining.is_empty:
                    remaining = None

            breakdown.append(
                BreakdownItem(
                    constraint_type=constraint_type,
                    label=CONSTRAINT_LABELS.get(constraint_type, constraint_type),
                    enabled=cfg.enabled,
                    buffer_meters=cfg.buffer_meters,
                    raw_intersection_acres=sqm_to_acres(raw_sqm),
                    uniquely_removed_acres=sqm_to_acres(unique_sqm),
                    percentage_of_parcel=(
                        raw_sqm / parcel_area_sqm * 100 if parcel_area_sqm > 0 else 0.0
                    ),
                    reason=CONSTRAINT_REASONS.get(constraint_type, ""),
                    source_dataset_id=layer_dataset_ids.get(constraint_type),
                )
            )

        # Manual exclusion breakdown (after system constraints, before restoration)
        if manual_exclusion_geom and not manual_exclusion_geom.is_empty:
            raw_sqm = area_sqm(manual_exclusion_geom)
            unique_part = (
                safe_intersection(manual_exclusion_geom, remaining)
                if remaining is not None
                else None
            )
            unique_sqm = area_sqm(unique_part) if unique_part and not unique_part.is_empty else 0.0
            if unique_part and not unique_part.is_empty and remaining is not None:
                remaining = safe_difference(remaining, unique_part)
                remaining = normalize_geometry(remaining) if remaining else None

            breakdown.append(
                BreakdownItem(
                    constraint_type="manual_exclusion",
                    label="Manual exclusion (user-drawn)",
                    enabled=True,
                    buffer_meters=0.0,
                    raw_intersection_acres=sqm_to_acres(raw_sqm),
                    uniquely_removed_acres=sqm_to_acres(unique_sqm),
                    percentage_of_parcel=(
                        raw_sqm / parcel_area_sqm * 100 if parcel_area_sqm > 0 else 0.0
                    ),
                    reason=(
                        "User-drawn exclusion polygon. This is a scenario override, "
                        "not a legal determination."
                    ),
                    source_dataset_id=None,
                )
            )

        # Manual restoration: negative entry showing land added back
        if manual_restoration_geom and not manual_restoration_geom.is_empty:
            restore_sqm = area_sqm(manual_restoration_geom)
            breakdown.append(
                BreakdownItem(
                    constraint_type="manual_restoration",
                    label="Manual restoration (user-drawn)",
                    enabled=True,
                    buffer_meters=0.0,
                    raw_intersection_acres=-sqm_to_acres(restore_sqm),
                    uniquely_removed_acres=-sqm_to_acres(restore_sqm),
                    percentage_of_parcel=(
                        -(restore_sqm / parcel_area_sqm * 100) if parcel_area_sqm > 0 else 0.0
                    ),
                    reason=(
                        "User-drawn restoration polygon (override). This removes "
                        "geometry from the effective excluded area for scenario "
                        "analysis. It is NOT a legal or engineering determination."
                    ),
                    source_dataset_id=None,
                )
            )

        return breakdown
