import type {
  ParcelSummary,
  ParcelDetail,
  AnalysisRequest,
  AnalysisResult,
  ConstraintConfigResponse,
  DatasetMetadata,
} from '@/types';

// Use local backend URL or fall back to localhost
const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Normalized error thrown by API helpers. */
export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
}

const constraintConfigResponse: ConstraintConfigResponse = {
  constraints: [
    {
      type: 'wetlands',
      label: 'Wetlands',
      defaultBufferMeters: 30,
      minBuffer: 0,
      maxBuffer: 5000,
      defaultEnabled: true,
      supportedClassifications: [],
    },
    {
      type: 'floodplain',
      label: 'FEMA Flood Hazard',
      defaultBufferMeters: 0,
      minBuffer: 0,
      maxBuffer: 1000,
      defaultEnabled: true,
      supportedClassifications: ['A', 'AE', 'AH', 'AO', 'VE', 'X', 'X500'],
    },
    {
      type: 'transmission',
      label: 'Transmission Lines',
      defaultBufferMeters: 30,
      minBuffer: 0,
      maxBuffer: 500,
      defaultEnabled: true,
      supportedClassifications: [],
    },
  ],
  priorityOrder: ['wetlands', 'floodplain', 'transmission'],
  analysisCrs: 'EPSG:3857',
  analysisCrsDescription:
    'Analysis is performed in Web Mercator (EPSG:3857) using planar area calculations.',
};

export interface ParcelSearchResponse {
  items: ParcelSummary[];
  total: number;
  limit: number;
  offset: number;
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
  let url = `${baseUrl}/api/v1/parcels?limit=${limit}&offset=${offset}`;
  if (query && query.trim()) {
    url += `&query=${encodeURIComponent(query.trim())}`;
  }
  if (bbox) {
    url += `&bbox=${bbox.join(',')}`;
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw { status: response.status, message: 'Failed to search parcels' } as ApiError;
  }

  const data = await response.json();
  const items = (data.items ?? []).map((p: any) => ({
    id: p.id,
    sourceId: p.sourceId !== undefined ? p.sourceId : p.source_id,
    displayName: p.displayName !== undefined ? p.displayName : p.display_name,
    countyName: p.countyName !== undefined ? p.countyName : p.county_name,
    address: p.address,
    sourceAreaAcres: p.sourceAreaAcres !== undefined ? p.sourceAreaAcres : p.source_area_acres,
    centroid: p.centroid,
  }));

  return {
    items,
    total: data.total,
    limit: data.limit,
    offset: data.offset,
  };
}

/**
 * Fetch full parcel detail including WGS84 GeoJSON geometry.
 */
export async function getParcel(id: string, signal?: AbortSignal): Promise<ParcelDetail> {
  const response = await fetch(`${baseUrl}/api/v1/parcels/${id}`, { signal });
  if (!response.ok) {
    throw { status: response.status, message: `Failed to fetch parcel ${id}` } as ApiError;
  }

  const p = await response.json();
  return {
    id: p.id,
    sourceId: p.sourceId !== undefined ? p.sourceId : p.source_id,
    displayName: p.displayName !== undefined ? p.displayName : p.display_name,
    countyName: p.countyName !== undefined ? p.countyName : p.county_name,
    address: p.address,
    sourceAreaAcres: p.sourceAreaAcres !== undefined ? p.sourceAreaAcres : p.source_area_acres,
    centroid: p.centroid,
    geometryGeojson: p.geometryGeojson !== undefined ? p.geometryGeojson : p.geometry_geojson,
    geometry: p.geometryGeojson !== undefined ? p.geometryGeojson : p.geometry_geojson,
  };
}

/**
 * Run a buildable-land analysis for a parcel via backend API.
 */
export async function runAnalysis(
  req: AnalysisRequest,
  signal?: AbortSignal,
): Promise<AnalysisResult> {
  const response = await fetch(`${baseUrl}/api/v1/analyses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
    signal,
  });

  if (!response.ok) {
    let message = `Analysis failed (${response.status})`;
    try {
      const body = await response.json();
      if (body?.detail) message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      // ignore
    }
    throw { status: response.status, message } as ApiError;
  }

  return response.json();
}

/**
 * Fetch the constraint configuration for the frontend.
 */
export async function getConstraintConfig(): Promise<ConstraintConfigResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/config/constraints`);
    if (response.ok) {
      return response.json();
    }
  } catch {
    // fallback
  }
  return constraintConfigResponse;
}

/**
 * Fetch metadata for all source datasets.
 */
export async function getDatasets(signal?: AbortSignal): Promise<DatasetMetadata[]> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/datasets`, { signal });
    if (response.ok) {
      return response.json();
    }
  } catch {
    // fallback
  }
  return [];
}

/** Simple health probe. */
export async function getHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ─── Saved Analyses (Local Storage fallback) ───────────────────────────────────

export interface SavedAnalysis {
  id: string;
  parcelId: string;
  parcelName: string;
  settings: unknown;
  summary: import('@/types').AnalysisSummary;
  breakdown: import('@/types').BreakdownItem[];
  createdAt: string;
}

const LOCAL_STORAGE_KEY = 'landscope_saved_analyses';

function getLocalSavedAnalyses(): SavedAnalysis[] {
  try {
    const val = localStorage.getItem(LOCAL_STORAGE_KEY);
    return val ? JSON.parse(val) : [];
  } catch {
    return [];
  }
}

function saveLocalSavedAnalyses(list: SavedAnalysis[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save analyses to local storage', err);
  }
}

export async function saveAnalysis(
  result: AnalysisResult,
  parcelId: string,
  parcelName: string,
  settings: unknown,
): Promise<string> {
  const list = getLocalSavedAnalyses();
  const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  const newAnalysis: SavedAnalysis = {
    id,
    parcelId,
    parcelName,
    settings,
    summary: result.summary,
    breakdown: result.breakdown,
    createdAt: new Date().toISOString(),
  };
  list.unshift(newAnalysis);
  saveLocalSavedAnalyses(list);
  return id;
}

export async function listSavedAnalyses(): Promise<SavedAnalysis[]> {
  return getLocalSavedAnalyses();
}

export async function deleteSavedAnalysis(id: string): Promise<void> {
  const list = getLocalSavedAnalyses();
  const filtered = list.filter((item) => item.id !== id);
  saveLocalSavedAnalyses(filtered);
}

export async function listAllParcels(): Promise<ParcelSummary[]> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/parcels?limit=100`);
    if (response.ok) {
      const data = await response.json();
      return (data.items ?? []).map((p: any) => ({
        id: p.id,
        sourceId: p.sourceId !== undefined ? p.sourceId : p.source_id,
        displayName: p.displayName !== undefined ? p.displayName : p.display_name,
        countyName: p.countyName !== undefined ? p.countyName : p.county_name,
        address: p.address,
        sourceAreaAcres: p.sourceAreaAcres !== undefined ? p.sourceAreaAcres : p.source_area_acres,
        centroid: p.centroid,
      }));
    }
  } catch {
    // fallback
  }
  return [];
}
