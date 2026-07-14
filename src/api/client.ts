import { createClient } from '@supabase/supabase-js';
import type {
  ParcelSummary,
  ParcelDetail,
  AnalysisRequest,
  AnalysisResult,
  ConstraintConfigResponse,
  DatasetMetadata,
} from '@/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

/** Normalized error thrown by API helpers. */
export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
}

const edgeFunctionUrl = `${supabaseUrl}/functions/v1/landscope-analysis`;

const constraintConfigResponse: ConstraintConfigResponse = {
  constraints: [
    {
      type: 'wetlands',
      label: 'Wetlands',
      defaultBufferMeters: 0,
      minBuffer: 0,
      maxBuffer: 500,
      defaultEnabled: true,
      supportedClassifications: [],
    },
    {
      type: 'floodplain',
      label: 'Floodplain',
      defaultBufferMeters: 0,
      minBuffer: 0,
      maxBuffer: 500,
      defaultEnabled: true,
      supportedClassifications: ['AE', 'X', 'A', 'AO', 'AH', 'VE'],
    },
    {
      type: 'transmission',
      label: 'Transmission Lines',
      defaultBufferMeters: 50,
      minBuffer: 0,
      maxBuffer: 1000,
      defaultEnabled: true,
      supportedClassifications: ['138kV', '345kV', '69kV', '500kV'],
    },
  ],
  priorityOrder: ['wetlands', 'floodplain', 'transmission'],
  analysisCrs: 'EPSG:4326',
  analysisCrsDescription:
    'Analysis is performed in WGS84 (EPSG:4326) using geodesic area calculations for accuracy.',
};

export interface ParcelSearchResponse {
  items: ParcelSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface SupabaseParcel {
  id: string;
  source_id: string;
  display_name: string;
  county_name: string;
  address: string | null;
  source_area_acres: number | null;
  geometry_geojson?: GeoJSON.Geometry | null;
  centroid_lon: number;
  centroid_lat: number;
}

function mapParcelSummary(p: SupabaseParcel): ParcelSummary {
  return {
    id: p.id,
    sourceId: p.source_id,
    displayName: p.display_name,
    countyName: p.county_name,
    address: p.address,
    sourceAreaAcres: p.source_area_acres != null ? Number(p.source_area_acres) : null,
    centroid: { lon: p.centroid_lon, lat: p.centroid_lat },
  };
}

function mapParcelDetail(p: SupabaseParcel): ParcelDetail {
  const geom = p.geometry_geojson as GeoJSON.MultiPolygon | GeoJSON.Polygon;
  return {
    ...mapParcelSummary(p),
    geometryGeojson: geom,
    geometry: geom,
  };
}

/**
 * Search parcels by text query and/or WGS84 bounding box.
 */
export async function searchParcels(
  query?: string,
  bbox?: [number, number, number, number],
  limit = 20,
  offset = 0,
  signal?: AbortSignal,
): Promise<ParcelSearchResponse> {
  let q = supabase
    .from('ls_parcels')
    .select('id, source_id, display_name, county_name, address, source_area_acres, centroid_lon, centroid_lat', { count: 'exact' })
    .order('display_name');

  if (query && query.trim()) {
    const trimmed = query.trim();
    // Try exact source_id match first, then fuzzy text search
    if (trimmed.toUpperCase().startsWith('DEMO-PARCEL')) {
      q = q.eq('source_id', trimmed.toUpperCase());
    } else {
      q = q.or(`display_name.ilike.%${trimmed}%,address.ilike.%${trimmed}%,source_id.ilike.%${trimmed}%`);
    }
  }

  if (bbox) {
    const [minx, miny, maxx, maxy] = bbox;
    q = q
      .gte('centroid_lon', minx)
      .lte('centroid_lon', maxx)
      .gte('centroid_lat', miny)
      .lte('centroid_lat', maxy);
  }

  q = q.range(offset, offset + limit - 1);

  if (signal) q = q.abortSignal(signal);
  const { data, error, count } = await q;

  if (error) {
    throw { status: 500, message: error.message } as ApiError;
  }

  const items = (data ?? []).map(mapParcelSummary);

  return {
    items,
    total: count ?? items.length,
    limit,
    offset,
  };
}

/**
 * Fetch full parcel detail including WGS84 GeoJSON geometry.
 */
export async function getParcel(id: string, signal?: AbortSignal): Promise<ParcelDetail> {
  let q = supabase
    .from('ls_parcels')
    .select('id, source_id, display_name, county_name, address, source_area_acres, geometry_geojson, centroid_lon, centroid_lat')
    .or(`id.eq.${id},source_id.eq.${id}`);

  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q.maybeSingle();

  if (error) {
    throw { status: 500, message: error.message } as ApiError;
  }

  if (!data) {
    throw { status: 404, message: `Parcel not found: ${id}` } as ApiError;
  }

  return mapParcelDetail(data as SupabaseParcel);
}

/**
 * Run a buildable-land analysis for a parcel via edge function.
 */
export async function runAnalysis(
  req: AnalysisRequest,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const response = await fetch(edgeFunctionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    let message = `Analysis failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore parse error
    }
    throw { status: response.status, message } as ApiError;
  }

  const data = await response.json();
  return data as AnalysisResult;
}

/**
 * Fetch the constraint configuration for the frontend.
 */
export async function getConstraintConfig(): Promise<ConstraintConfigResponse> {
  return constraintConfigResponse;
}

interface SupabaseDataset {
  id: string;
  name: string;
  provider: string;
  source_url: string;
  licence: string;
  retrieved_at: string | null;
  source_version: string | null;
  analysis_crs: string;
  feature_count: number | null;
  notes: string | null;
}

/**
 * Fetch metadata for all source datasets.
 */
export async function getDatasets(signal?: AbortSignal): Promise<DatasetMetadata[]> {
  let q = supabase
    .from('ls_dataset_metadata')
    .select('id, name, provider, source_url, licence, retrieved_at, source_version, analysis_crs, feature_count, notes')
    .order('name');
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;

  if (error) {
    return [];
  }

  return (data ?? []).map((d: SupabaseDataset) => ({
    id: d.id,
    name: d.name,
    provider: d.provider,
    sourceUrl: d.source_url,
    licence: d.licence,
    retrievedAt: d.retrieved_at,
    sourceVersion: d.source_version,
    analysisCrs: d.analysis_crs,
    featureCount: d.feature_count,
    notes: d.notes,
  }));
}

/** Simple health probe — always returns true since we use Supabase directly. */
export async function getHealth(): Promise<boolean> {
  return true;
}

// ─── Saved Analyses ───────────────────────────────────────────────────────────

export interface SavedAnalysis {
  id: string;
  parcelId: string;
  parcelName: string;
  settings: unknown;
  summary: import('@/types').AnalysisSummary;
  breakdown: import('@/types').BreakdownItem[];
  createdAt: string;
}

interface SupabaseSavedAnalysis {
  id: string;
  parcel_id: string;
  parcel_name: string;
  settings: unknown;
  summary: unknown;
  breakdown: unknown;
  created_at: string;
}

export async function saveAnalysis(
  result: AnalysisResult,
  parcelId: string,
  parcelName: string,
  settings: unknown,
): Promise<string> {
  const { data, error } = await supabase
    .from('ls_saved_analyses')
    .insert({
      parcel_id: parcelId,
      parcel_name: parcelName,
      settings,
      summary: result.summary,
      breakdown: result.breakdown,
      warnings: result.warnings,
    })
    .select('id')
    .single();

  if (error) {
    throw { status: 500, message: error.message } as ApiError;
  }

  return data.id;
}

export async function listSavedAnalyses(): Promise<SavedAnalysis[]> {
  const { data, error } = await supabase
    .from('ls_saved_analyses')
    .select('id, parcel_id, parcel_name, settings, summary, breakdown, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    return [];
  }

  return (data as SupabaseSavedAnalysis[]).map((d) => ({
    id: d.id,
    parcelId: d.parcel_id,
    parcelName: d.parcel_name,
    settings: d.settings,
    summary: d.summary as import('@/types').AnalysisSummary,
    breakdown: d.breakdown as import('@/types').BreakdownItem[],
    createdAt: d.created_at,
  }));
}

export async function deleteSavedAnalysis(id: string): Promise<void> {
  await supabase.from('ls_saved_analyses').delete().eq('id', id);
}

export async function listAllParcels(): Promise<ParcelSummary[]> {
  const { data, error } = await supabase
    .from('ls_parcels')
    .select('id, source_id, display_name, county_name, address, source_area_acres, centroid_lon, centroid_lat')
    .order('display_name');

  if (error || !data) {
    return [];
  }

  return (data as SupabaseParcel[]).map(mapParcelSummary);
}
