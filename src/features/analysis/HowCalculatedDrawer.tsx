import { useEffect } from 'react';
import { X, Calculator, MapPin, Ruler, AlertTriangle } from 'lucide-react';

interface HowCalculatedDrawerProps {
  open: boolean;
  onClose: () => void;
  analysisCrs?: string;
  analysisCrsDescription?: string;
}

/**
 * Side drawer explaining the geometry model behind the analysis.
 */
export function HowCalculatedDrawer({
  open,
  onClose,
  analysisCrs = 'EPSG:32614',
  analysisCrsDescription = 'UTM Zone 14N — appropriate for Brazos County, Texas',
}: HowCalculatedDrawerProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-brand-900/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-slide-in"
        role="dialog"
        aria-label="How buildable area is calculated"
      >
        <header className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-brand-800">How buildable area is calculated</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm text-brand-700">
          {/* Geometry model */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-500">
              Geometry Model
            </h3>
            <p className="mb-3 leading-relaxed">
              The buildable area is computed by starting with the full parcel polygon and
              subtracting constraint buffers, manual exclusions, then adding back manual
              restorations:
            </p>
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 font-mono text-xs leading-relaxed text-brand-800">
              <div>P = parcel</div>
              <div>C₁…Cₙ = constraint layers (wetlands, floodplain, transmission)</div>
              <div>M_exclude = manual exclusion polygons</div>
              <div>M_restore = manual restoration polygons</div>
              <div className="mt-2 border-t border-brand-200 pt-2">
                <div>buildable = P − ⋃(Cᵢ ⊕ bufferᵢ) − M_exclude + M_restore</div>
              </div>
            </div>
          </section>

          {/* Priority attribution */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-500">
              Unique Attribution
            </h3>
            <p className="leading-relaxed">
              When constraints overlap, each excluded area is attributed to the highest-priority
              constraint only. This means the breakdown table shows uniquely removed acreage —
              overlapping constraints are never double-counted.
            </p>
          </section>

          {/* CRS */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-500">
              <MapPin className="h-3.5 w-3.5" />
              Coordinate Reference System
            </h3>
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-brand-500" />
                <span className="font-mono text-xs font-semibold text-brand-800">{analysisCrs}</span>
              </div>
              <p className="mt-1.5 text-xs text-brand-600">{analysisCrsDescription}</p>
              <p className="mt-1.5 text-xs text-brand-500">
                All area calculations are performed in this projected CRS (meters) for accuracy,
                then geometries are converted back to WGS84 (EPSG:4326) for display on the map.
              </p>
            </div>
          </section>

          {/* Disclaimer */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-excluded-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Disclaimer
            </h3>
            <div className="rounded-lg border border-excluded-200 bg-excluded-50 p-3 text-xs leading-relaxed text-excluded-800">
              This is a preliminary screening tool only. Results are not a legal, engineering,
              zoning, surveying, flood-certification, or wetland-delineation determination. All
              results require professional verification before any land use decision.
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
