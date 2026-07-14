import { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { useAppStore } from '@/stores/appStore';
import { useMapDraw } from '@/hooks/useMapDraw';
import { MapLegend } from './MapLegend';
import { LayerVisibilityToggle } from './LayerVisibilityToggle';
import { MapPopup, type PopupContent } from './MapPopup';
import type { AnalysisResult, ParcelDetail } from '@/types';

const INITIAL_CENTER: [number, number] = [-96.33, 30.63]; // College Station, TX
const INITIAL_ZOOM = 11;

// OSM raster tiles — free, no API key required.
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

interface MapViewProps {
  parcel: ParcelDetail | null;
  analysis: AnalysisResult | null;
  isCalculating: boolean;
  onMapReady?: (map: { fitBounds: (bbox: [[number, number], [number, number]], opts?: { padding?: number; duration?: number }) => void }) => void;
}

/**
 * Main MapLibre GL map. Renders parcel + analysis layers and integrates the
 * custom draw mode.
 */
export function MapView({ parcel, analysis, isCalculating, onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const onMapReadyRef = useRef(onMapReady);
  useEffect(() => { onMapReadyRef.current = onMapReady; });
  const [map, setMap] = useState<MLMap | null>(null);
  const [popup, setPopup] = useState<PopupContent | null>(null);
  const drawMode = useAppStore((s) => s.drawMode);
  const manualExclusions = useAppStore((s) => s.manualExclusions);
  const manualRestorations = useAppStore((s) => s.manualRestorations);

  const draw = useMapDraw(map);

  // ---- Initialize the map once ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE as maplibregl.StyleSpecification,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: false,
    });

    mapRef.current = m;

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

    m.on('load', () => {
      // Register all sources/layers up front; we'll update data later.
      setupSourcesAndLayers(m);
      setMap(m);
      onMapReadyRef.current?.(m);
    });

    return () => {
      m.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);

  // ---- Fly to parcel when it changes ----
  useEffect(() => {
    if (!map || !parcel) return;
    const bounds = computeBounds(parcel.geometry);
    if (bounds) {
      const [[minx, miny], [maxx, maxy]] = bounds;
      map.fitBounds(
        [
          [minx, miny],
          [maxx, maxy],
        ],
        { padding: 60, duration: 800, maxZoom: 16 },
      );
    } else if (parcel.centroid) {
      map.flyTo({
        center: [parcel.centroid.lon, parcel.centroid.lat],
        zoom: 14,
        duration: 800,
      });
    }
  }, [map, parcel]);

  // ---- Update parcel source ----
  useEffect(() => {
    if (!map) return;
    if (!map.getSource('parcel')) return;

    if (parcel) {
      const fc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'parcel' },
            geometry: parcel.geometry,
          },
        ],
      };
      (map.getSource('parcel') as maplibregl.GeoJSONSource).setData(fc);
    } else {
      (map.getSource('parcel') as maplibregl.GeoJSONSource).setData(EMPTY_FC);
    }
  }, [map, parcel]);

  // ---- Update analysis layers atomically ----
  useEffect(() => {
    if (!map) return;

    const updateSource = (id: string, geom: GeoJSON.Geometry | null) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (geom) {
        src.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: geom }],
        });
      } else {
        src.setData(EMPTY_FC);
      }
    };

    if (!analysis) {
      updateSource('buildable', null);
      updateSource('excluded', null);
      updateSource('wetlands', null);
      updateSource('floodplain', null);
      updateSource('transmission', null);
      updateSource('manual-exclusions', null);
      updateSource('manual-restorations', null);
      return;
    }

    const g = analysis.geometry;
    updateSource('buildable', g.buildable);
    updateSource('excluded', g.excluded);
    updateSource('wetlands', g.exclusionsByConstraint.wetlands ?? null);
    updateSource('floodplain', g.exclusionsByConstraint.floodplain ?? null);
    updateSource('transmission', g.exclusionsByConstraint.transmission ?? null);
    updateSource('manual-exclusions', g.manualExclusions);
    updateSource('manual-restorations', g.manualRestorations);
  }, [map, analysis]);

  // ---- Update manual edit sources from the store (for live preview) ----
  useEffect(() => {
    if (!map) return;
    const src = map.getSource('manual-exclusions-live') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(manualExclusions);
  }, [map, manualExclusions]);

  useEffect(() => {
    if (!map) return;
    const src = map.getSource('manual-restorations-live') as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(manualRestorations);
  }, [map, manualRestorations]);

  // ---- Draw preview layer ----
  useEffect(() => {
    if (!map) return;
    const src = map.getSource('draw-preview') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;

    if (draw.coordinates.length === 0) {
      (src as maplibregl.GeoJSONSource).setData(EMPTY_FC);
      return;
    }

    const coords = [...draw.coordinates];
    // Close the ring for the fill preview if we have >= 3 points.
    const ring =
      coords.length >= 3 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])
        ? [...coords, coords[0]]
        : coords;

    const features: GeoJSON.Feature[] = [];
    if (coords.length >= 3) {
      features.push({
        type: 'Feature',
        properties: { kind: 'preview-fill' },
        geometry: { type: 'Polygon', coordinates: [ring] },
      });
    }
    // Always add a line preview.
    features.push({
      type: 'Feature',
      properties: { kind: 'preview-line' },
      geometry: { type: 'LineString', coordinates: ring },
    });
    // Vertex markers.
    coords.forEach((c, i) => {
      features.push({
        type: 'Feature',
        properties: { kind: 'preview-vertex', index: i },
        geometry: { type: 'Point', coordinates: c },
      });
    });

    (src as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  }, [map, draw.coordinates]);

  // ---- Hover popups on analysis layers ----
  useEffect(() => {
    if (!map) return;
    const layers = ['buildable-fill', 'excluded-fill', 'wetlands-fill', 'floodplain-fill', 'transmission-fill', 'manual-exclusion-fill', 'manual-restoration-fill'];
    const handlers: Array<() => void> = [];

    const move = (e: MapMouseEvent) => {
      if (drawMode !== 'pan') {
        setPopup(null);
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, { layers });
      if (hits.length === 0) {
        setPopup(null);
        map.getCanvas().style.cursor = '';
        return;
      }
      map.getCanvas().style.cursor = 'pointer';
      const f = hits[0];
      const layer = f.layer?.id;
      const labelMap: Record<string, string> = {
        'buildable-fill': 'Buildable Area',
        'excluded-fill': 'Excluded Area',
        'wetlands-fill': 'Wetlands Constraint',
        'floodplain-fill': 'Floodplain Constraint',
        'transmission-fill': 'Transmission Constraint',
        'manual-exclusion-fill': 'Manual Exclusion',
        'manual-restoration-fill': 'Manual Restoration',
      };
      setPopup({
        lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
        title: labelMap[layer ?? ''] ?? 'Feature',
        description: f.properties?.reason ? String(f.properties.reason) : undefined,
      });
    };

    const leave = () => {
      setPopup(null);
      if (map) map.getCanvas().style.cursor = '';
    };

    map.on('mousemove', move);
    map.on('mouseleave', layers[0], leave);
    handlers.push(() => map.off('mousemove', move));
    return () => {
      handlers.forEach((h) => h());
      map.off('mousemove', move);
    };
  }, [map, drawMode]);

  // ---- Draw mode cursor hint overlay ----
  const drawHint = useMemo(() => {
    if (drawMode === 'exclude')
      return { text: 'Click to add exclusion vertices · Double-click to finish · Esc to cancel', color: 'text-excluded-700' };
    if (drawMode === 'restore')
      return { text: 'Click to add restoration vertices · Double-click to finish · Esc to cancel', color: 'text-buildable-700' };
    return null;
  }, [drawMode]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" data-testid="map-container" />

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10">
        <MapLegend />
      </div>

      {/* Layer visibility toggles */}
      <div className="absolute bottom-3 right-3 z-10">
        <LayerVisibilityToggle map={map} />
      </div>

      {/* Calculating indicator */}
      {isCalculating && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-brand-200 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-sm">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700" />
          <span className="text-xs font-medium text-brand-700">Recalculating…</span>
        </div>
      )}

      {/* Draw mode hint */}
      {drawHint && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div className={`rounded-full border border-brand-200 bg-white/95 px-4 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm ${drawHint.color}`}>
            {drawHint.text}
          </div>
        </div>
      )}

      <MapPopup map={map} content={popup} onClose={() => setPopup(null)} />
    </div>
  );
}

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function setupSourcesAndLayers(map: MLMap) {
  // --- Sources ---
  const addGeoJSONSource = (id: string) => {
    if (!map.getSource(id)) {
      map.addSource(id, { type: 'geojson', data: EMPTY_FC });
    }
  };

  addGeoJSONSource('parcel');
  addGeoJSONSource('buildable');
  addGeoJSONSource('excluded');
  addGeoJSONSource('wetlands');
  addGeoJSONSource('floodplain');
  addGeoJSONSource('transmission');
  addGeoJSONSource('manual-exclusions');
  addGeoJSONSource('manual-restorations');
  addGeoJSONSource('manual-exclusions-live');
  addGeoJSONSource('manual-restorations-live');
  addGeoJSONSource('draw-preview');

  // --- Parcel layers ---
  map.addLayer({
    id: 'parcel-fill',
    type: 'fill',
    source: 'parcel',
    paint: {
      'fill-color': '#ffffff',
      'fill-opacity': 0.15,
    },
  });
  map.addLayer({
    id: 'parcel-outline',
    type: 'line',
    source: 'parcel',
    paint: {
      'line-color': '#1e293b',
      'line-width': 2,
    },
  });

  // --- Buildable ---
  map.addLayer({
    id: 'buildable-fill',
    type: 'fill',
    source: 'buildable',
    paint: {
      'fill-color': '#22c55e',
      'fill-opacity': 0.4,
    },
  });
  map.addLayer({
    id: 'buildable-outline',
    type: 'line',
    source: 'buildable',
    paint: {
      'line-color': '#15803d',
      'line-width': 1.5,
    },
  });

  // --- Excluded (effective) ---
  map.addLayer({
    id: 'excluded-fill',
    type: 'fill',
    source: 'excluded',
    paint: {
      'fill-color': '#dc2626',
      'fill-opacity': 0.4,
    },
  });
  map.addLayer({
    id: 'excluded-outline',
    type: 'line',
    source: 'excluded',
    paint: {
      'line-color': '#991b1b',
      'line-width': 1,
    },
  });

  // --- Wetlands ---
  map.addLayer({
    id: 'wetlands-fill',
    type: 'fill',
    source: 'wetlands',
    paint: {
      'fill-color': '#3b82f6',
      'fill-opacity': 0.3,
    },
  });

  // --- Floodplain ---
  map.addLayer({
    id: 'floodplain-fill',
    type: 'fill',
    source: 'floodplain',
    paint: {
      'fill-color': '#fbbf24',
      'fill-opacity': 0.3,
    },
  });

  // --- Transmission ---
  map.addLayer({
    id: 'transmission-fill',
    type: 'fill',
    source: 'transmission',
    paint: {
      'fill-color': '#8b5cf6',
      'fill-opacity': 0.3,
    },
  });

  // --- Manual exclusions (hatched) ---
  // A fill layer for the base color + a fill-pattern for hatching.
  map.addLayer({
    id: 'manual-exclusion-fill',
    type: 'fill',
    source: 'manual-exclusions',
    paint: {
      'fill-color': '#dc2626',
      'fill-opacity': 0.5,
    },
  });
  map.addLayer({
    id: 'manual-exclusion-outline',
    type: 'line',
    source: 'manual-exclusions',
    paint: {
      'line-color': '#991b1b',
      'line-width': 1.5,
      'line-dasharray': [2, 1],
    },
  });

  // Live manual exclusions (drawn but analysis not yet returned) — same styling.
  map.addLayer({
    id: 'manual-exclusion-live-fill',
    type: 'fill',
    source: 'manual-exclusions-live',
    paint: {
      'fill-color': '#dc2626',
      'fill-opacity': 0.5,
    },
  });
  map.addLayer({
    id: 'manual-exclusion-live-outline',
    type: 'line',
    source: 'manual-exclusions-live',
    paint: {
      'line-color': '#991b1b',
      'line-width': 1.5,
      'line-dasharray': [2, 1],
    },
  });

  // --- Manual restorations ---
  map.addLayer({
    id: 'manual-restoration-fill',
    type: 'fill',
    source: 'manual-restorations',
    paint: {
      'fill-color': '#4ade80',
      'fill-opacity': 0.5,
    },
  });
  map.addLayer({
    id: 'manual-restoration-outline',
    type: 'line',
    source: 'manual-restorations',
    paint: {
      'line-color': '#166534',
      'line-width': 1.5,
    },
  });

  // Live manual restorations.
  map.addLayer({
    id: 'manual-restoration-live-fill',
    type: 'fill',
    source: 'manual-restorations-live',
    paint: {
      'fill-color': '#4ade80',
      'fill-opacity': 0.5,
    },
  });
  map.addLayer({
    id: 'manual-restoration-live-outline',
    type: 'line',
    source: 'manual-restorations-live',
    paint: {
      'line-color': '#166534',
      'line-width': 1.5,
    },
  });

  // --- Draw preview ---
  map.addLayer({
    id: 'draw-preview-fill',
    type: 'fill',
    source: 'draw-preview',
    filter: ['==', ['get', 'kind'], 'preview-fill'],
    paint: {
      'fill-color': ['match', ['get', 'kind'], 'preview-fill', '#f59e0b', '#f59e0b'],
      'fill-opacity': 0.2,
    },
  });
  map.addLayer({
    id: 'draw-preview-line',
    type: 'line',
    source: 'draw-preview',
    filter: ['==', ['get', 'kind'], 'preview-line'],
    paint: {
      'line-color': '#0f172a',
      'line-width': 2,
      'line-dasharray': [2, 2],
    },
  });
  map.addLayer({
    id: 'draw-preview-vertex',
    type: 'circle',
    source: 'draw-preview',
    filter: ['==', ['get', 'kind'], 'preview-vertex'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#0f172a',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
  });
}

function computeBounds(geom: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;

  const walk = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      const [x, y] = coords as number[];
      if (x < minx) minx = x;
      if (y < miny) miny = y;
      if (x > maxx) maxx = x;
      if (y > maxy) maxy = y;
    } else {
      for (const c of coords) walk(c);
    }
  };

  if (geom.type === 'Polygon') {
    walk(geom.coordinates);
  } else if (geom.type === 'MultiPolygon') {
    walk(geom.coordinates);
  } else {
    return null;
  }

  if (minx === Infinity) return null;
  return [
    [minx, miny],
    [maxx, maxy],
  ];
}
