import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, Loader2, X } from 'lucide-react';
import { useParcelSearch } from '@/hooks/useParcelSearch';
import { useAppStore } from '@/stores/appStore';
import { searchParcels } from '@/api/client';

// Demo parcel quick-select labels. On click we search for "DEMO-PARCEL-A" etc.
// and auto-select the first result, so the IDs always match the backend's UUIDs.
const DEMO_PARCEL_LABELS: { query: string; label: string }[] = [
  { query: 'DEMO-PARCEL-A', label: 'Demo Parcel A' },
  { query: 'DEMO-PARCEL-B', label: 'Demo Parcel B' },
  { query: 'DEMO-PARCEL-C', label: 'Demo Parcel C' },
];

interface ParcelSearchProps {
  onSelect?: (id: string) => void;
}

export function ParcelSearch({ onSelect }: ParcelSearchProps) {
  const { input, setInput, items, total, isLoading, isError, enabled } = useParcelSearch();
  const setSelectedParcel = useAppStore((s) => s.setSelectedParcel);
  const selectedParcelId = useAppStore((s) => s.selectedParcelId);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedParcel(id);
    setOpen(false);
    setInput('');
    onSelect?.(id);
  };

  const handleDemoSelect = async (query: string) => {
    // Search for the demo parcel by source_id and auto-select the first result.
    try {
      const res = await searchParcels(query, undefined, 5, 0);
      if (res.items.length > 0) {
        handleSelect(res.items[0].id);
      }
    } catch {
      // If the backend isn't ready, silently ignore; user can search manually.
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search parcels by name, address, or ID…"
          className="w-full rounded-lg border border-brand-200 bg-white py-2 pl-9 pr-9 text-sm text-brand-800 placeholder:text-brand-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
          data-testid="parcel-search-input"
        />
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-brand-400 hover:bg-brand-100 hover:text-brand-600"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-8 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-400" />
        )}
      </div>

      {/* Dropdown results */}
      {open && enabled && (
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-lg border border-brand-200 bg-white shadow-lg"
          data-testid="parcel-search-dropdown"
        >
          {isError && (
            <div className="p-3 text-sm text-excluded-600">Failed to search parcels. Try again.</div>
          )}
          {!isError && items.length === 0 && (
            <div className="p-3 text-sm text-brand-400">No parcels found.</div>
          )}
          {!isError && items.length > 0 && (
            <ul className="py-1">
              {items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(p.id)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-brand-50 ${
                      p.id === selectedParcelId ? 'bg-brand-100' : ''
                    }`}
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-brand-800" title={p.displayName}>
                        {p.displayName}
                      </div>
                      <div className="mt-0.5 text-xs text-brand-500">
                        {p.countyName}
                        {p.sourceAreaAcres != null && ` · ${p.sourceAreaAcres.toFixed(2)} ac`}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
              {total > items.length && (
                <li className="border-t border-brand-100 px-3 py-1.5 text-center text-xs text-brand-400">
                  Showing {items.length} of {total} results
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Demo parcel quick-select */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-brand-400">Try:</span>
        {DEMO_PARCEL_LABELS.map((p) => (
          <button
            key={p.query}
            type="button"
            onClick={() => handleDemoSelect(p.query)}
            className="rounded-full border border-brand-200 bg-white px-2.5 py-1 text-xs font-medium text-brand-600 hover:border-brand-300 hover:bg-brand-50"
            data-testid={`demo-parcel-${p.query}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
