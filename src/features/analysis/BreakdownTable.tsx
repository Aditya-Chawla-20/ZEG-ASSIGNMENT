import { Info, Locate } from 'lucide-react';
import type { BreakdownItem } from '@/types';

interface BreakdownTableProps {
  items: BreakdownItem[];
  isLoading: boolean;
  onZoomToConstraint?: (constraintType: string) => void;
}

const CONSTRAINT_COLORS: Record<string, string> = {
  wetlands: 'bg-wetlands-500',
  floodplain: 'bg-floodplain-500',
  transmission: 'bg-transmission-500',
  manual: 'bg-excluded-500',
};

function formatAcres(acres: number): string {
  if (Number.isNaN(acres)) return '—';
  return `${acres.toFixed(2)}`;
}

function formatPct(pct: number): string {
  if (Number.isNaN(pct)) return '—';
  return `${pct.toFixed(1)}%`;
}

export function BreakdownTable({ items, isLoading, onZoomToConstraint }: BreakdownTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-8 animate-pulse-subtle rounded border border-brand-100 bg-brand-50"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-brand-400">No breakdown available. Run an analysis to see details.</p>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-brand-200">
        <table className="w-full text-sm" data-testid="breakdown-table">
          <thead>
            <tr className="border-b border-brand-200 bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-500">
              <th className="px-3 py-2 font-semibold">Constraint</th>
              <th className="px-3 py-2 text-right font-semibold">Buffer</th>
              <th className="px-3 py-2 text-right font-semibold">Unique Removed</th>
              <th className="px-3 py-2 text-right font-semibold">% of Parcel</th>
              <th className="px-2 py-2 text-center font-semibold">
                <Info className="h-3.5 w-3.5" />
              </th>
              <th className="px-2 py-2 text-center font-semibold">Zoom</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const color = CONSTRAINT_COLORS[item.constraintType] ?? 'bg-brand-400';
              return (
                <tr
                  key={`${item.constraintType}-${idx}`}
                  className="border-b border-brand-100 last:border-0 hover:bg-brand-50/50"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-3 w-3 shrink-0 rounded-sm ${color} ${item.enabled ? '' : 'opacity-30'}`}
                      />
                      <span className={item.enabled ? 'text-brand-800' : 'text-brand-400 line-through'}>
                        {item.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-brand-700">
                    {item.bufferMeters > 0 ? `${Math.round(item.bufferMeters)} m` : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-brand-800">
                    {formatAcres(item.uniquelyRemovedAcres)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-brand-700">
                    {formatPct(item.percentageOfParcel)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <div className="group relative inline-flex">
                      <Info className="h-3.5 w-3.5 cursor-help text-brand-400" />
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-md border border-brand-200 bg-white p-2 text-xs text-brand-700 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                        {item.reason}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {item.uniquelyRemovedAcres > 0 && onZoomToConstraint && (
                      <button
                        type="button"
                        title="Zoom to constraint"
                        aria-label="Zoom to constraint"
                        onClick={() => onZoomToConstraint(item.constraintType)}
                        className="inline-flex items-center justify-center rounded-md p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-700"
                      >
                        <Locate className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-brand-400">
        Breakdown acreage is uniquely attributed in priority order so overlapping constraints are not counted twice.
      </p>
    </div>
  );
}
