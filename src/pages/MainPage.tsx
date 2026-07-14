import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, AlertCircle, RotateCcw, PanelLeft, GitCompare, Printer } from 'lucide-react';
import { ParcelSearch } from '@/features/parcels/ParcelSearch';
import { MapView } from '@/features/map/MapView';
import { SummaryCards } from '@/features/analysis/SummaryCards';
import { ControlPanel } from '@/features/analysis/ControlPanel';
import { BreakdownTable } from '@/features/analysis/BreakdownTable';
import { HowCalculatedDrawer } from '@/features/analysis/HowCalculatedDrawer';
import { DataSourcesPanel } from '@/features/analysis/DataSourcesPanel';
import { DisclaimerBanner } from '@/features/analysis/DisclaimerBanner';
import { ExportPanel } from '@/features/analysis/ExportPanel';
import { ShareButton } from '@/features/analysis/ShareButton';
import { SaveAnalysisButton } from '@/features/analysis/SaveAnalysisButton';
import { SavedAnalysesPanel } from '@/features/analysis/SavedAnalysesPanel';
import { ComparePanel } from '@/features/analysis/ComparePanel';
import { printReport } from '@/features/analysis/printReport';
import { useAnalysis } from '@/hooks/useAnalysis';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAppStore } from '@/stores/appStore';
import { getConstraintConfig, getDatasets, getParcel, type SavedAnalysis } from '@/api/client';
import { cn } from '@/lib/utils';

const MOBILE_BREAKPOINT = 1024;

export function MainPage() {
  const selectedParcelId = useAppStore((s) => s.selectedParcelId);
  const [howOpen, setHowOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const mapRef = useRef<{ fitBounds: (bbox: [[number, number], [number, number]], opts?: { padding?: number; duration?: number }) => void } | null>(null);

  // Sidebar open state: default true on desktop, false on mobile.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= MOBILE_BREAKPOINT;
    }
    return true;
  });

  // Activate global keyboard shortcuts.
  useKeyboardShortcuts();

  // Fetch constraint config once.
  const constraintConfigQuery = useQuery({
    queryKey: ['constraint-config'],
    queryFn: () => getConstraintConfig(),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch datasets.
  const datasetsQuery = useQuery({
    queryKey: ['datasets'],
    queryFn: ({ signal }) => getDatasets(signal),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch parcel detail when selected.
  const parcelQuery = useQuery({
    queryKey: ['parcel', selectedParcelId],
    queryFn: ({ signal }) => getParcel(selectedParcelId!, signal),
    enabled: !!selectedParcelId,
    staleTime: 5 * 60 * 1000,
  });

  const { result, isLoading, isCalculating, error, runAnalysisNow } = useAnalysis();

  const constraintConfig = constraintConfigQuery.data ?? null;
  const datasets = datasetsQuery.data ?? [];
  const parcel = parcelQuery.data ?? null;

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Restore parcel selection from URL param on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p');
    if (p) {
      useAppStore.getState().setSelectedParcel(p);
    }
  }, []);

  return (
    <div className="flex h-screen flex-col bg-brand-50 text-brand-900">
      {/* ===== Header ===== */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-brand-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Sidebar toggle — mobile only */}
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex items-center justify-center rounded-md border border-brand-200 bg-white p-1.5 text-brand-700 hover:bg-brand-50 lg:hidden"
            aria-label="Toggle sidebar"
            aria-expanded={sidebarOpen}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-800 text-white">
            <Calculator className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight text-brand-800">
              LandScope
            </h1>
            <p className="text-xs leading-tight text-brand-500">Buildable Land Analysis</p>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-4">
          <ParcelSearch />
        </div>

        <div className="flex items-center gap-2">
          {selectedParcelId && result && (
            <SaveAnalysisButton result={result} parcelName={parcel?.displayName ?? 'Unknown'} />
          )}
          {selectedParcelId && result && (
            <button
              type="button"
              onClick={() =>
                printReport(
                  parcel?.displayName ?? 'Unknown',
                  result.summary,
                  result.breakdown,
                  result.warnings,
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Report</span>
            </button>
          )}
          {selectedParcelId && (
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <GitCompare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Compare</span>
            </button>
          )}
          <ShareButton />
          <span className="hidden items-center gap-1.5 rounded-full border border-floodplain-300 bg-floodplain-50 px-2.5 py-1 text-xs font-medium text-floodplain-800 sm:flex">
            <AlertCircle className="h-3 w-3" />
            Screening tool — not a determination
          </span>
          <button
            type="button"
            onClick={() => setHowOpen(true)}
            className="rounded-md border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            How is this calculated?
          </button>
        </div>
      </header>

      {/* ===== Body ===== */}
      <div className="flex min-h-0 flex-1">
        {/* --- Mobile backdrop --- */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={closeSidebar}
            aria-hidden="true"
          />
        )}

        {/* --- Control Panel / Sidebar --- */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 flex w-80 shrink-0 flex-col border-r border-brand-200 bg-white transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <DisclaimerBanner />

            {selectedParcelId && (
              <SummaryCards summary={result?.summary ?? null} isLoading={isLoading} />
            )}

            <ControlPanel constraintConfig={constraintConfig} parcel={parcel} />

            {selectedParcelId && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-500">
                  Breakdown
                </h3>
                <BreakdownTable
                  items={result?.breakdown ?? []}
                  isLoading={isLoading}
                  onZoomToConstraint={(constraintType) => {
                    const geom = result?.geometry?.exclusionsByConstraint?.[constraintType];
                    if (geom && mapRef.current) {
                      const bbox = computeBBox(geom);
                      if (bbox) mapRef.current.fitBounds(bbox, { padding: 60, duration: 800 });
                    }
                  }}
                />
              </div>
            )}

            <ExportPanel analysis={result} parcelId={selectedParcelId} />

            <SavedAnalysesPanel onSelect={(s: SavedAnalysis) => {
              useAppStore.getState().setSelectedParcel(s.parcelId);
            }} />

            <DataSourcesPanel
              datasets={datasets}
              warnings={result?.warnings ?? []}
              isLoading={datasetsQuery.isLoading}
            />
          </div>
        </aside>

        {/* --- Map --- */}
        <main className="relative min-w-0 flex-1">
          {error && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-lg border border-excluded-200 bg-excluded-50 px-3 py-2 text-sm text-excluded-800 shadow-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Analysis failed: {error.message}</span>
                <button
                  type="button"
                  onClick={runAnalysisNow}
                  className="flex items-center gap-1 rounded border border-excluded-300 bg-white px-2 py-0.5 text-xs font-medium text-excluded-700 hover:bg-excluded-100"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            </div>
          )}

          {selectedParcelId && parcelQuery.isError && (
            <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
              <div className="flex items-center gap-2 rounded-lg border border-excluded-200 bg-excluded-50 px-3 py-2 text-sm text-excluded-800 shadow-md">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Failed to load parcel. Please try another.</span>
              </div>
            </div>
          )}

          <MapView parcel={parcel} analysis={result} isCalculating={isCalculating} onMapReady={(m) => { mapRef.current = m; }} />

          {/* Empty state */}
          {!selectedParcelId && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="pointer-events-auto max-w-sm rounded-xl border border-brand-200 bg-white/95 p-6 text-center shadow-lg backdrop-blur-sm">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                  <Calculator className="h-6 w-6 text-brand-500" />
                </div>
                <h2 className="text-base font-semibold text-brand-800">
                  Select a parcel to begin
                </h2>
                <p className="mt-1.5 text-sm text-brand-500">
                  Search for a parcel above or pick one of the demo parcels to run a buildable
                  land analysis. You'll see wetlands, floodplain, and transmission constraints
                  visualized on the map.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {compareOpen && <ComparePanel onClose={() => setCompareOpen(false)} />}

      <HowCalculatedDrawer
        open={howOpen}
        onClose={() => setHowOpen(false)}
        analysisCrs={constraintConfig?.analysisCrs}
        analysisCrsDescription={constraintConfig?.analysisCrsDescription}
      />
    </div>
  );
}

function computeBBox(geom: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const walk = (coords: unknown) => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const p = coords as number[];
      minLon = Math.min(minLon, p[0]);
      minLat = Math.min(minLat, p[1]);
      maxLon = Math.max(maxLon, p[0]);
      maxLat = Math.max(maxLat, p[1]);
    } else if (Array.isArray(coords)) {
      (coords as unknown[]).forEach(walk);
    }
  };
  const g = geom as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  walk(g.coordinates);
  if (minLon === Infinity) return null;
  return [[minLon, minLat], [maxLon, maxLat]];
}
