import { useState } from 'react';
import { GitCompare, X, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listAllParcels, runAnalysis } from '@/api/client';
import type { ParcelSummary, AnalysisResult } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

interface ComparePanelProps {
  onClose: () => void;
}

interface CompareRow {
  label: string;
  getValue: (r: AnalysisResult | null) => string;
}

const compareRows: CompareRow[] = [
  { label: 'Parcel Acres', getValue: (r) => (r ? r.summary.parcelAcres.toFixed(2) : '—') },
  { label: 'Excluded Acres', getValue: (r) => (r ? r.summary.excludedAcres.toFixed(2) : '—') },
  { label: 'Buildable Acres', getValue: (r) => (r ? r.summary.buildableAcres.toFixed(2) : '—') },
  { label: 'Buildable %', getValue: (r) => (r ? `${r.summary.buildablePercentage.toFixed(1)}%` : '—') },
];

export function ComparePanel({ onClose }: ComparePanelProps) {
  const analysisSettings = useAppStore((s) => s.analysisSettings);
  const manualExclusions = useAppStore((s) => s.manualExclusions);
  const manualRestorations = useAppStore((s) => s.manualRestorations);
  const [parcelAID, setParcelAID] = useState<string>('');
  const [parcelBID, setParcelBID] = useState<string>('');
  const [resultA, setResultA] = useState<AnalysisResult | null>(null);
  const [resultB, setResultB] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const parcelsQuery = useQuery({
    queryKey: ['all-parcels'],
    queryFn: listAllParcels,
    staleTime: 60_000,
  });

  const parcels: ParcelSummary[] = parcelsQuery.data ?? [];

  const runComparison = async () => {
    if (!parcelAID || !parcelBID) return;
    setLoading(true);
    setResultA(null);
    setResultB(null);
    try {
      const basePayload = {
        constraints: analysisSettings,
        manualEdits: { exclusions: manualExclusions, restorations: manualRestorations },
      };
      const [a, b] = await Promise.all([
        runAnalysis({ ...basePayload, parcelId: parcelAID }),
        runAnalysis({ ...basePayload, parcelId: parcelBID }),
      ]);
      setResultA(a);
      setResultB(b);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/30 backdrop-blur-[1px]">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-brand-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-brand-800">Compare Parcels</h2>
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

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-600">Parcel A</label>
              <select
                value={parcelAID}
                onChange={(e) => setParcelAID(e.target.value)}
                className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm text-brand-800 focus:border-brand-400 focus:outline-none"
              >
                <option value="">Select parcel…</option>
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-600">Parcel B</label>
              <select
                value={parcelBID}
                onChange={(e) => setParcelBID(e.target.value)}
                className="w-full rounded-md border border-brand-200 px-2 py-1.5 text-sm text-brand-800 focus:border-brand-400 focus:outline-none"
              >
                <option value="">Select parcel…</option>
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={runComparison}
            disabled={!parcelAID || !parcelBID || loading}
            className="mb-4 flex items-center gap-1.5 rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
          >
            {loading ? 'Comparing…' : 'Run Comparison'}
          </button>

          {(resultA || resultB) && (
            <div className="overflow-hidden rounded-lg border border-brand-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-200 bg-brand-50 text-left text-xs uppercase tracking-wide text-brand-500">
                    <th className="px-3 py-2 font-semibold">Metric</th>
                    <th className="px-3 py-2 text-right font-semibold">Parcel A</th>
                    <th className="px-3 py-2 text-center font-semibold"></th>
                    <th className="px-3 py-2 text-right font-semibold">Parcel B</th>
                  </tr>
                </thead>
                <tbody>
                  {compareRows.map((row, idx) => {
                    const valA = row.getValue(resultA);
                    const valB = row.getValue(resultB);
                    const numA = parseFloat(valA);
                    const numB = parseFloat(valB);
                    const aBetter = !Number.isNaN(numA) && !Number.isNaN(numB) && numA > numB;
                    const bBetter = !Number.isNaN(numA) && !Number.isNaN(numB) && numB > numA;
                    return (
                      <tr key={idx} className="border-b border-brand-100 last:border-0">
                        <td className="px-3 py-2 text-brand-600">{row.label}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums font-medium', aBetter ? 'text-buildable-700' : 'text-brand-800')}>
                          {valA}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <ArrowRight className="mx-auto h-3 w-3 text-brand-300" />
                        </td>
                        <td className={cn('px-3 py-2 text-right tabular-nums font-medium', bBetter ? 'text-buildable-700' : 'text-brand-800')}>
                          {valB}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
