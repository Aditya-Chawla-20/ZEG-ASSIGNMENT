import { Info } from 'lucide-react';

interface LegendItem {
  label: string;
  swatch: string;
  border?: string;
  hatched?: boolean;
}

const items: LegendItem[] = [
  { label: 'Buildable', swatch: 'bg-buildable-500', border: 'border-buildable-600' },
  { label: 'Excluded', swatch: 'bg-excluded-500', border: 'border-excluded-600' },
  { label: 'Wetlands', swatch: 'bg-wetlands-500', border: 'border-wetlands-600' },
  { label: 'Floodplain', swatch: 'bg-floodplain-500', border: 'border-floodplain-600' },
  { label: 'Transmission', swatch: 'bg-transmission-500', border: 'border-transmission-600' },
  { label: 'Manual exclusion', swatch: 'bg-excluded-500', hatched: true, border: 'border-excluded-700' },
  { label: 'Manual restoration', swatch: 'bg-buildable-400', border: 'border-buildable-600' },
];

export function MapLegend() {
  return (
    <div className="pointer-events-auto rounded-lg border border-brand-200 bg-white/95 shadow-md backdrop-blur-sm">
      <div className="flex items-center gap-1.5 border-b border-brand-100 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-brand-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Legend
        </span>
      </div>
      <ul className="space-y-1.5 p-3">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            {item.hatched ? (
              <span
                className={`inline-block h-4 w-4 rounded border ${item.border ?? 'border-brand-300'}`}
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #dc2626 0, #dc2626 2px, transparent 2px, transparent 5px)',
                  backgroundColor: 'rgba(220, 38, 38, 0.25)',
                }}
              />
            ) : (
              <span
                className={`inline-block h-4 w-4 rounded border ${item.border ?? 'border-brand-300'} ${item.swatch}`}
              />
            )}
            <span className="text-xs text-brand-700">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
