import { createClient } from "npm:@supabase/supabase-js@2";
import * as turf from "npm:@turf/turf@7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ConstraintConfig {
  type: string;
  enabled: boolean;
  bufferMeters: number;
  classifications: string[];
}

interface ManualEdits {
  exclusions: GeoJSON.FeatureCollection;
  restorations: GeoJSON.FeatureCollection;
}

interface AnalysisRequest {
  parcelId: string;
  constraints: ConstraintConfig[];
  manualEdits: ManualEdits;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, code: string, status = 400): Response {
  return jsonResponse(
    { error: { code, message, requestId: crypto.randomUUID() } },
    status,
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json() as AnalysisRequest;
    const { parcelId, constraints, manualEdits } = body;

    if (!parcelId) {
      return errorResponse("parcelId is required", "INVALID_REQUEST", 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the parcel
    const { data: parcel, error: parcelError } = await supabase
      .from("ls_parcels")
      .select("id, source_id, display_name, county_name, address, source_area_acres, geometry_geojson, centroid_lon, centroid_lat")
      .eq("id", parcelId)
      .maybeSingle();

    if (parcelError) {
      return errorResponse(`Database error: ${parcelError.message}`, "DB_ERROR", 500);
    }
    if (!parcel) {
      // Try by source_id
      const { data: parcel2 } = await supabase
        .from("ls_parcels")
        .select("id, source_id, display_name, county_name, address, source_area_acres, geometry_geojson, centroid_lon, centroid_lat")
        .eq("source_id", parcelId)
        .maybeSingle();
      if (!parcel2) {
        return errorResponse(`Parcel not found: ${parcelId}`, "PARCEL_NOT_FOUND", 404);
      }
      return await runAnalysis(parcel2, constraints, manualEdits, supabase);
    }

    return await runAnalysis(parcel, constraints, manualEdits, supabase);
  } catch (err) {
    return errorResponse(
      err instanceof Error ? err.message : "Internal server error",
      "INTERNAL_ERROR",
      500,
    );
  }
});

async function runAnalysis(
  parcel: any,
  constraints: ConstraintConfig[],
  manualEdits: ManualEdits,
  supabase: any,
): Promise<Response> {
  const warnings: string[] = [];
  const startTime = performance.now();

  const parcelGeom = parcel.geometry_geojson as GeoJSON.Geometry;
  const parcelFeature = turf.feature(parcelGeom);
  const parcelAreaSqM = turf.area(parcelFeature);

  // Convert to acres
  const SQM_TO_ACRES = 1 / 4046.8564224;
  const parcelAcres = parcelAreaSqM * SQM_TO_ACRES;

  // Fetch all constraint features that might intersect
  const { data: allConstraints, error: constraintError } = await supabase
    .from("ls_constraint_features")
    .select("id, dataset_id, layer_type, source_id, classification, geometry_geojson, properties");

  if (constraintError) {
    return errorResponse(`Failed to fetch constraints: ${constraintError.message}`, "DB_ERROR", 500);
  }

  // Fetch dataset metadata for source_dataset_id references
  const { data: datasets } = await supabase
    .from("ls_dataset_metadata")
    .select("id, name");

  const datasetNameMap = new Map<string, string>();
  for (const ds of datasets ?? []) {
    datasetNameMap.set(ds.id, ds.name);
  }

  // Priority order for unique attribution
  const PRIORITY = ["wetlands", "floodplain", "transmission"];

  // Build per-layer constraint unions
  const layerUnions: Record<string, GeoJSON.Geometry | null> = {};
  const layerBufferMeters: Record<string, number> = {};
  const layerEnabled: Record<string, boolean> = {};
  const layerDatasetId: Record<string, string | null> = {};

  for (const cfg of constraints) {
    layerEnabled[cfg.type] = cfg.enabled;
    layerBufferMeters[cfg.type] = cfg.bufferMeters || 0;

    if (!cfg.enabled) {
      layerUnions[cfg.type] = null;
      continue;
    }

    // Filter constraints by layer type and classification
    let layerFeatures = (allConstraints ?? []).filter(
      (f: any) => f.layer_type === cfg.type,
    );

    // If classifications are specified, filter by them
    if (cfg.classifications.length > 0) {
      layerFeatures = layerFeatures.filter((f: any) =>
        cfg.classifications.includes(f.classification)
      );
    }

    // Find the dataset_id for this layer
    if (layerFeatures.length > 0) {
      layerDatasetId[cfg.type] = layerFeatures[0].dataset_id;
    }

    // Buffer each feature and union
    const bufferedGeoms: GeoJSON.Geometry[] = [];
    for (const feat of layerFeatures) {
      const featGeom = feat.geometry_geojson as GeoJSON.Geometry;
      if (cfg.bufferMeters > 0) {
        // Buffer in meters — turf.buffer uses kilometers
        const buffered = turf.buffer(featGeom, cfg.bufferMeters / 1000, { units: "kilometers" });
        if (buffered) {
          bufferedGeoms.push(buffered.geometry);
        }
      } else {
        bufferedGeoms.push(featGeom);
      }
    }

    if (bufferedGeoms.length === 0) {
      layerUnions[cfg.type] = null;
    } else if (bufferedGeoms.length === 1) {
      layerUnions[cfg.type] = bufferedGeoms[0];
    } else {
      const union = turf.union(
        turf.featureCollection(bufferedGeoms.map((g) => turf.feature(g))),
      );
      layerUnions[cfg.type] = union?.geometry ?? null;
    }
  }

  // Unique attribution: process layers in priority order
  let remainingExcluded: GeoJSON.Geometry | null = null;
  const exclusionsByConstraint: Record<string, GeoJSON.Geometry> = {};
  const breakdown: any[] = [];

  for (const layerType of PRIORITY) {
    if (!layerEnabled[layerType]) {
      // Layer disabled — still include in breakdown with 0
      const dsId = layerDatasetId[layerType] ?? null;
      breakdown.push({
        constraintType: layerType,
        label: layerType.charAt(0).toUpperCase() + layerType.slice(1),
        enabled: false,
        bufferMeters: layerBufferMeters[layerType] ?? 0,
        rawIntersectionAcres: 0,
        uniquelyRemovedAcres: 0,
        percentageOfParcel: 0,
        reason: "Layer disabled by user",
        sourceDatasetId: dsId ? datasetNameMap.get(dsId) ?? null : null,
      });
      continue;
    }

    const layerUnion = layerUnions[layerType];
    if (!layerUnion) {
      const dsId = layerDatasetId[layerType] ?? null;
      breakdown.push({
        constraintType: layerType,
        label: layerType.charAt(0).toUpperCase() + layerType.slice(1),
        enabled: true,
        bufferMeters: layerBufferMeters[layerType] ?? 0,
        rawIntersectionAcres: 0,
        uniquelyRemovedAcres: 0,
        percentageOfParcel: 0,
        reason: "No constraint features found for this layer",
        sourceDatasetId: dsId ? datasetNameMap.get(dsId) ?? null : null,
      });
      continue;
    }

    // Intersect with parcel
    let intersection: GeoJSON.Geometry | null = null;
    try {
      const inter = turf.intersect(
        turf.feature(parcelGeom),
        turf.feature(layerUnion),
      );
      intersection = inter?.geometry ?? null;
    } catch {
      intersection = null;
    }

    if (!intersection) {
      const dsId = layerDatasetId[layerType] ?? null;
      breakdown.push({
        constraintType: layerType,
        label: layerType.charAt(0).toUpperCase() + layerType.slice(1),
        enabled: true,
        bufferMeters: layerBufferMeters[layerType] ?? 0,
        rawIntersectionAcres: 0,
        uniquelyRemovedAcres: 0,
        percentageOfParcel: 0,
        reason: "Constraint does not intersect parcel",
        sourceDatasetId: dsId ? datasetNameMap.get(dsId) ?? null : null,
      });
      continue;
    }

    const rawAreaSqM = turf.area(turf.feature(intersection));
    const rawAcres = rawAreaSqM * SQM_TO_ACRES;

    // Subtract already-excluded area for unique attribution
    let uniquePart: GeoJSON.Geometry | null = intersection;
    if (remainingExcluded) {
      try {
        const diff = turf.difference(
          turf.feature(intersection),
          turf.feature(remainingExcluded),
        );
        uniquePart = diff?.geometry ?? null;
      } catch {
        uniquePart = intersection;
      }
    }

    let uniqueAcres = 0;
    if (uniquePart) {
      const uniqueAreaSqM = turf.area(turf.feature(uniquePart));
      uniqueAcres = uniqueAreaSqM * SQM_TO_ACRES;
      exclusionsByConstraint[layerType] = uniquePart;

      // Add to remaining excluded
      if (remainingExcluded) {
        try {
          const combined = turf.union(
            turf.featureCollection([
              turf.feature(remainingExcluded),
              turf.feature(uniquePart),
            ]),
          );
          remainingExcluded = combined?.geometry ?? uniquePart;
        } catch {
          remainingExcluded = uniquePart;
        }
      } else {
        remainingExcluded = uniquePart;
      }
    }

    const dsId = layerDatasetId[layerType] ?? null;
    breakdown.push({
      constraintType: layerType,
      label: layerType.charAt(0).toUpperCase() + layerType.slice(1),
      enabled: true,
      bufferMeters: layerBufferMeters[layerType] ?? 0,
      rawIntersectionAcres: Math.round(rawAcres * 100) / 100,
      uniquelyRemovedAcres: Math.round(uniqueAcres * 100) / 100,
      percentageOfParcel: parcelAcres > 0 ? Math.round((uniqueAcres / parcelAcres) * 10000) / 100 : 0,
      reason: `${rawAcres * SQM_TO_ACRES > uniqueAcres ? "Overlap with higher-priority constraint reduced unique area" : "Direct intersection with parcel"}`,
      sourceDatasetId: dsId ? datasetNameMap.get(dsId) ?? null : null,
    });
  }

  // Apply manual exclusions
  let manualExclusionGeom: GeoJSON.Geometry | null = null;
  if (manualEdits?.exclusions?.features?.length > 0) {
    const exclusionGeoms = manualEdits.exclusions.features
      .filter((f) => f.geometry)
      .map((f) => f.geometry!);

    // Clip to parcel
    const clipped: GeoJSON.Geometry[] = [];
    for (const g of exclusionGeoms) {
      try {
        const inter = turf.intersect(turf.feature(parcelGeom), turf.feature(g));
        if (inter?.geometry) clipped.push(inter.geometry);
      } catch {
        // skip invalid
      }
    }

    if (clipped.length === 1) {
      manualExclusionGeom = clipped[0];
    } else if (clipped.length > 1) {
      const union = turf.union(
        turf.featureCollection(clipped.map((g) => turf.feature(g))),
      );
      manualExclusionGeom = union?.geometry ?? null;
    }

    if (manualExclusionGeom) {
      if (remainingExcluded) {
        try {
          const combined = turf.union(
            turf.featureCollection([
              turf.feature(remainingExcluded),
              turf.feature(manualExclusionGeom),
            ]),
          );
          remainingExcluded = combined?.geometry ?? manualExclusionGeom;
        } catch {
          // keep existing
        }
      } else {
        remainingExcluded = manualExclusionGeom;
      }
    }
  }

  // Apply manual restorations (subtract from excluded)
  let manualRestorationGeom: GeoJSON.Geometry | null = null;
  if (manualEdits?.restorations?.features?.length > 0) {
    const restorationGeoms = manualEdits.restorations.features
      .filter((f) => f.geometry)
      .map((f) => f.geometry!);

    const clipped: GeoJSON.Geometry[] = [];
    for (const g of restorationGeoms) {
      try {
        const inter = turf.intersect(turf.feature(parcelGeom), turf.feature(g));
        if (inter?.geometry) clipped.push(inter.geometry);
      } catch {
        // skip
      }
    }

    if (clipped.length === 1) {
      manualRestorationGeom = clipped[0];
    } else if (clipped.length > 1) {
      const union = turf.union(
        turf.featureCollection(clipped.map((g) => turf.feature(g))),
      );
      manualRestorationGeom = union?.geometry ?? null;
    }

    if (manualRestorationGeom && remainingExcluded) {
      try {
        const diff = turf.difference(
          turf.feature(remainingExcluded),
          turf.feature(manualRestorationGeom),
        );
        remainingExcluded = diff?.geometry ?? remainingExcluded;
      } catch {
        // keep existing
      }
    }
  }

  // Compute buildable = parcel - excluded
  let buildableGeom: GeoJSON.Geometry | null = null;
  if (remainingExcluded) {
    try {
      const diff = turf.difference(
        turf.feature(parcelGeom),
        turf.feature(remainingExcluded),
      );
      buildableGeom = diff?.geometry ?? null;
    } catch {
      buildableGeom = parcelGeom;
    }
  } else {
    buildableGeom = parcelGeom;
  }

  const excludedAreaSqM = remainingExcluded ? turf.area(turf.feature(remainingExcluded)) : 0;
  const buildableAreaSqM = buildableGeom ? turf.area(turf.feature(buildableGeom)) : 0;

  const excludedAcres = excludedAreaSqM * SQM_TO_ACRES;
  const buildableAcres = buildableAreaSqM * SQM_TO_ACRES;
  const buildablePercentage = parcelAcres > 0 ? (buildableAcres / parcelAcres) * 100 : 0;

  const durationMs = Math.round(performance.now() - startTime);

  const result = {
    analysisId: crypto.randomUUID(),
    summary: {
      parcelAcres: Math.round(parcelAcres * 100) / 100,
      excludedAcres: Math.round(excludedAcres * 100) / 100,
      buildableAcres: Math.round(buildableAcres * 100) / 100,
      buildablePercentage: Math.round(buildablePercentage * 100) / 100,
    },
    breakdown,
    geometry: {
      parcel: parcelGeom,
      buildable: buildableGeom,
      excluded: remainingExcluded,
      exclusionsByConstraint,
      manualExclusions: manualExclusionGeom,
      manualRestorations: manualRestorationGeom,
    },
    warnings,
    metrics: {
      analysisDurationMs: durationMs,
      candidateConstraintFeatures: allConstraints?.length ?? 0,
    },
  };

  return jsonResponse(result);
}
