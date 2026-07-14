import { useState } from 'react';
import { ChevronDown, ChevronRight, Database, AlertTriangle, ExternalLink } from 'lucide-react';
import type { DatasetMetadata } from '@/types';

interface DataSourcesPanelProps {
  datasets: DatasetMetadata[];
  warnings: string[];
  isLoading: boolean;
}

export function DataSourcesPanel({ datasets, warnings, isLoading }: DataSourcesPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-brand-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Database className="h-3.5 w-3.5 text-brand-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Data Sources
          </span>
          {warnings.length > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-floodplain-100 px-1.5 py-0.5 text-[10px] font-medium text-floodplain-700">
              <AlertTriangle className="h-2.5 w-2.5" />
              {warnings.length}
            </span>
          )}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-brand-400" /> : <ChevronRight className="h-4 w-4 text-brand-400" />}
      </button>

      {open && (
        <div className="border-t border-brand-100 p-3">
          {isLoading && (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse-subtle rounded border border-brand-100 bg-brand-50" />
              ))}
            </div>
          )}

          {!isLoading && warnings.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 rounded-md border border-floodplain-200 bg-floodplain-50 p-2 text-xs text-floodplain-800"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {!isLoading && datasets.length === 0 && warnings.length === 0 && (
            <p className="text-xs text-brand-400">No dataset metadata available.</p>
          )}

          {!isLoading && datasets.length > 0 && (
            <ul className="space-y-2">
              {datasets.map((ds) => (
                <li key={ds.id} className="rounded-md border border-brand-100 bg-brand-50/50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-brand-800">{ds.name}</span>
                    {ds.sourceUrl && (
                      <a
                        href={ds.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 hover:text-brand-600"
                        title={ds.sourceUrl}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5 text-xs text-brand-500">
                    <div>Provider: <span className="text-brand-700">{ds.provider}</span></div>
                    <div>License: <span className="text-brand-700">{ds.licence}</span></div>
                    {ds.sourceVersion && (
                      <div>Version: <span className="text-brand-700">{ds.sourceVersion}</span></div>
                    )}
                    {ds.retrievedAt && (
                      <div>Retrieved: <span className="text-brand-700">{formatDate(ds.retrievedAt)}</span></div>
                    )}
                    {ds.featureCount != null && (
                      <div>Features: <span className="text-brand-700">{ds.featureCount.toLocaleString()}</span></div>
                    )}
                    <div>CRS: <span className="font-mono text-brand-700">{ds.analysisCrs}</span></div>
                    {ds.notes && <div className="text-brand-400">{ds.notes}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
