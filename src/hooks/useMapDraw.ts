import { useEffect, useRef, useState, useCallback } from 'react';
import type { Map as MLMap, MapMouseEvent } from 'maplibre-gl';
import { useAppStore } from '@/stores/appStore';
import type { DrawMode } from '@/types';

export interface DrawState {
  /** Coordinates of the polygon being drawn. */
  coordinates: [number, number][];
  /** True when actively drawing a polygon. */
  isDrawing: boolean;
}

/**
 * Custom MapLibre GL polygon draw mode.
 *
 * - Click to add vertices
 * - Double-click to close the polygon
 * - Escape to cancel the current drawing
 *
 * When a polygon is completed it is pushed into the store as either a manual
 * exclusion (drawMode === 'exclude') or a manual restoration
 * (drawMode === 'restore').
 *
 * The hook returns the current in-progress draw coordinates so the map can
 * render a preview layer, plus helper functions.
 */
export function useMapDraw(map: MLMap | null) {
  const drawMode = useAppStore((s) => s.drawMode);
  const addExclusionPolygon = useAppStore((s) => s.addExclusionPolygon);
  const addRestorationPolygon = useAppStore((s) => s.addRestorationPolygon);
  const setDrawMode = useAppStore((s) => s.setDrawMode);

  const [coordinates, setCoordinates] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const coordsRef = useRef<[number, number][]>([]);
  const isDrawingRef = useRef(false);

  // Keep refs in sync for use inside event handlers.
  useEffect(() => {
    coordsRef.current = coordinates;
  }, [coordinates]);
  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  const finishPolygon = useCallback(() => {
    const coords = coordsRef.current;
    if (coords.length < 3) {
      // Not enough vertices for a polygon — discard.
      setCoordinates([]);
      setIsDrawing(false);
      return;
    }

    // Close the ring.
    const ring: [number, number][] = [...coords];
    if (
      ring[0][0] !== ring[ring.length - 1][0] ||
      ring[0][1] !== ring[ring.length - 1][1]
    ) {
      ring.push(ring[0]);
    }

    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
      properties: {
        createdAt: new Date().toISOString(),
      },
    };

    const mode = useAppStore.getState().drawMode;
    if (mode === 'exclude') {
      addExclusionPolygon(feature);
    } else if (mode === 'restore') {
      addRestorationPolygon(feature);
    }

    setCoordinates([]);
    setIsDrawing(false);
  }, [addExclusionPolygon, addRestorationPolygon]);

  const cancelDrawing = useCallback(() => {
    setCoordinates([]);
    setIsDrawing(false);
  }, []);

  // Attach / detach event handlers based on draw mode.
  useEffect(() => {
    if (!map) return;
    if (drawMode === 'pan') {
      // Reset any in-progress drawing.
      setCoordinates([]);
      setIsDrawing(false);
      // Restore default cursor.
      map.getCanvas().style.cursor = '';
      return;
    }

    // Drawing mode: use crosshair cursor.
    map.getCanvas().style.cursor = 'crosshair';
    // Disable map drag while drawing so clicks add vertices.
    map.dragPan.disable();
    map.doubleClickZoom.disable();

    const onClick = (e: MapMouseEvent) => {
      e.preventDefault();
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const current = coordsRef.current;
      // If this is the first vertex, start drawing.
      if (current.length === 0) {
        setCoordinates([pt]);
        setIsDrawing(true);
      } else {
        setCoordinates([...current, pt]);
      }
    };

    const onDblClick = (e: MapMouseEvent) => {
      e.preventDefault();
      // The click handler fires before dblclick, so the last vertex was just
      // added. We don't need to add the dblclick point again.
      finishPolygon();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelDrawing();
      } else if (e.key === 'Enter') {
        finishPolygon();
      }
    };

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      window.removeEventListener('keydown', onKeyDown);
      map.getCanvas().style.cursor = '';
      map.dragPan.enable();
      map.doubleClickZoom.enable();
    };
  }, [map, drawMode, finishPolygon, cancelDrawing]);

  return {
    coordinates,
    isDrawing,
    cancelDrawing,
    finishPolygon,
    setDrawMode,
  };
}

export type { DrawMode };
