/**
 * Shared TypeScript types for the LandScope frontend.
 * These mirror the backend Pydantic schemas (camelCase over the wire).
 */

export interface ParcelCentroid {
  lon: number;
  lat: number;
}

export interface ParcelSummary {
  id: string;
  sourceId: string;
  displayName: string;
  countyName: string;
  address: string | null;
  sourceAreaAcres: number | null;
  centroid: ParcelCentroid;
}

export interface ParcelDetail extends ParcelSummary {
  /** WGS84 GeoJSON geometry (Polygon or MultiPolygon). */
  geometryGeojson: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  /** Alias kept for ergonomic internal use. */
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
}

export type ConstraintType = 'wetlands' | 'floodplain' | 'transmission';

export interface ConstraintConfig {
  type: ConstraintType;
  enabled: boolean;
  bufferMeters: number;
  classifications: string[];
}

export interface ManualEdits {
  exclusions: GeoJSON.FeatureCollection;
  restorations: GeoJSON.FeatureCollection;
}

export interface AnalysisRequest {
  parcelId: string;
  constraints: ConstraintConfig[];
  manualEdits: ManualEdits;
}

export interface BreakdownItem {
  constraintType: string;
  label: string;
  enabled: boolean;
  bufferMeters: number;
  rawIntersectionAcres: number;
  uniquelyRemovedAcres: number;
  percentageOfParcel: number;
  reason: string;
  sourceDatasetId: string | null;
}

export interface AnalysisSummary {
  parcelAcres: number;
  excludedAcres: number;
  buildableAcres: number;
  buildablePercentage: number;
}

export interface AnalysisGeometry {
  parcel: GeoJSON.Geometry;
  buildable: GeoJSON.Geometry | null;
  excluded: GeoJSON.Geometry | null;
  exclusionsByConstraint: Record<string, GeoJSON.Geometry>;
  manualExclusions: GeoJSON.Geometry | null;
  manualRestorations: GeoJSON.Geometry | null;
}

export interface AnalysisMetrics {
  analysisDurationMs: number;
  candidateConstraintFeatures: number;
}

export interface AnalysisResult {
  analysisId: string;
  summary: AnalysisSummary;
  breakdown: BreakdownItem[];
  geometry: AnalysisGeometry;
  warnings: string[];
  metrics: AnalysisMetrics;
}

export interface DatasetMetadata {
  id: string;
  name: string;
  provider: string;
  sourceUrl: string;
  licence: string;
  retrievedAt: string | null;
  sourceVersion: string | null;
  analysisCrs: string;
  featureCount: number | null;
  notes: string | null;
}

export type DrawMode = 'pan' | 'exclude' | 'restore';

export interface ConstraintUIConfig {
  type: ConstraintType;
  label: string;
  defaultBufferMeters: number;
  minBuffer: number;
  maxBuffer: number;
  defaultEnabled: boolean;
  supportedClassifications: string[];
}

export interface ConstraintConfigResponse {
  constraints: ConstraintUIConfig[];
  priorityOrder: string[];
  analysisCrs: string;
  analysisCrsDescription: string;
}


