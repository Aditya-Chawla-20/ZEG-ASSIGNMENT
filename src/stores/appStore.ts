import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ConstraintConfig, ConstraintType, ConstraintUIConfig, DrawMode } from '@/types';

const EMPTY_FC = (): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [],
});

export interface UndoEntry {
  exclusions: GeoJSON.FeatureCollection;
  restorations: GeoJSON.FeatureCollection;
}

export interface AppState {
  // --- selection & settings ---
  selectedParcelId: string | null;
  analysisSettings: ConstraintConfig[];
  drawMode: DrawMode;
  manualExclusions: GeoJSON.FeatureCollection;
  manualRestorations: GeoJSON.FeatureCollection;
  undoStack: UndoEntry[];
  isPanelOpen: boolean;
  selectedConstraintLayer: string | null;

  // --- actions ---
  setSelectedParcel: (id: string | null) => void;
  updateConstraint: (type: ConstraintType, updates: Partial<ConstraintConfig>) => void;
  resetConstraints: (defaults: ConstraintUIConfig[]) => void;
  setDrawMode: (mode: DrawMode) => void;
  addExclusionPolygon: (feature: GeoJSON.Feature) => void;
  addRestorationPolygon: (feature: GeoJSON.Feature) => void;
  deleteExclusionFeature: (id: string) => void;
  deleteRestorationFeature: (id: string) => void;
  undoLastEdit: () => void;
  clearManualEdits: () => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  setSelectedConstraintLayer: (layer: string | null) => void;
}

function defaultsFromConfig(cfgs: ConstraintUIConfig[]): ConstraintConfig[] {
  return cfgs.map((c: ConstraintUIConfig) => ({
    type: c.type,
    enabled: c.defaultEnabled,
    bufferMeters: c.defaultBufferMeters,
    classifications: c.supportedClassifications ? [...c.supportedClassifications] : [],
  }));
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    selectedParcelId: null,
    analysisSettings: [],
    drawMode: 'pan',
    manualExclusions: EMPTY_FC(),
    manualRestorations: EMPTY_FC(),
    undoStack: [],
    isPanelOpen: true,
    selectedConstraintLayer: null,

    setSelectedParcel: (id) =>
      set((s) => {
        s.selectedParcelId = id;
        // Clear manual edits when switching parcels.
        s.manualExclusions = EMPTY_FC();
        s.manualRestorations = EMPTY_FC();
        s.undoStack = [];
        s.drawMode = 'pan';
      }),

    updateConstraint: (type, updates) =>
      set((s) => {
        const idx = s.analysisSettings.findIndex((c: ConstraintConfig) => c.type === type);
        if (idx >= 0) {
          s.analysisSettings[idx] = { ...s.analysisSettings[idx], ...updates };
        }
      }),

    resetConstraints: (defaults) =>
      set((s) => {
        s.analysisSettings = defaultsFromConfig(defaults);
      }),

    setDrawMode: (mode) =>
      set((s) => {
        s.drawMode = mode;
      }),

    addExclusionPolygon: (feature) =>
      set((s) => {
        s.undoStack.push({
          exclusions: structuredClone(s.manualExclusions),
          restorations: structuredClone(s.manualRestorations),
        });
        if (!feature.id) {
          feature.id = `excl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        }
        s.manualExclusions.features.push(feature);
      }),

    addRestorationPolygon: (feature) =>
      set((s) => {
        s.undoStack.push({
          exclusions: structuredClone(s.manualExclusions),
          restorations: structuredClone(s.manualRestorations),
        });
        if (!feature.id) {
          feature.id = `rest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        }
        s.manualRestorations.features.push(feature);
      }),

    deleteExclusionFeature: (id) =>
      set((s) => {
        s.undoStack.push({
          exclusions: structuredClone(s.manualExclusions),
          restorations: structuredClone(s.manualRestorations),
        });
        s.manualExclusions.features = s.manualExclusions.features.filter(
          (f: GeoJSON.Feature) => String(f.id ?? '') !== id,
        );
      }),

    deleteRestorationFeature: (id) =>
      set((s) => {
        s.undoStack.push({
          exclusions: structuredClone(s.manualExclusions),
          restorations: structuredClone(s.manualRestorations),
        });
        s.manualRestorations.features = s.manualRestorations.features.filter(
          (f: GeoJSON.Feature) => String(f.id ?? '') !== id,
        );
      }),

    undoLastEdit: () =>
      set((s) => {
        const prev = s.undoStack.pop();
        if (prev) {
          s.manualExclusions = prev.exclusions;
          s.manualRestorations = prev.restorations;
        }
      }),

    clearManualEdits: () =>
      set((s) => {
        s.undoStack.push({
          exclusions: structuredClone(s.manualExclusions),
          restorations: structuredClone(s.manualRestorations),
        });
        s.manualExclusions = EMPTY_FC();
        s.manualRestorations = EMPTY_FC();
      }),

    togglePanel: () =>
      set((s) => {
        s.isPanelOpen = !s.isPanelOpen;
      }),

    setPanelOpen: (open) =>
      set((s) => {
        s.isPanelOpen = open;
      }),

    setSelectedConstraintLayer: (layer) =>
      set((s) => {
        s.selectedConstraintLayer = layer;
      }),
  })),
);

/** Build a fresh AnalysisRequest payload from the store. */
export function buildAnalysisRequest(
  state: Pick<
    AppState,
    'selectedParcelId' | 'analysisSettings' | 'manualExclusions' | 'manualRestorations'
  >,
) {
  return {
    parcelId: state.selectedParcelId ?? '',
    constraints: state.analysisSettings,
    manualEdits: {
      exclusions: state.manualExclusions,
      restorations: state.manualRestorations,
    },
  };
}

/** A stable string key for analysis inputs, used for debouncing/comparison. */
export function analysisInputKey(
  state: Pick<
    AppState,
    'selectedParcelId' | 'analysisSettings' | 'manualExclusions' | 'manualRestorations'
  >,
): string {
  return JSON.stringify({
    p: state.selectedParcelId,
    c: state.analysisSettings,
    e: state.manualExclusions,
    r: state.manualRestorations,
  });
}
