import { useState } from 'react';
import { Eye, EyeOff, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LayerToggle {
  id: string;
  label: string;
  color: string;
}

const DEFAULT_LAYERS: LayerToggle[] = [
  { id: 'buildable-fill', label: 'Buildable', color: 'bg-buildable-500' },
  { id: 'excluded-fill', label: 'Excluded', color: 'bg-excluded-500' },
  { id: 'wetlands-fill', label: 'Wetlands', color: 'bg-wetlands-500' },
  { id: 'floodplain-fill', label: 'Floodplain', color: 'bg-floodplain-500' },
  { id: 'transmission-fill', label: 'Transmission', color: 'bg-transmission-500' },
  { id: 'manual-exclusion-fill', label: 'Manual Excl.', color: 'bg-excluded-400' },
  { id: 'manual-restoration-fill', label: 'Manual Rest.', color: 'bg-buildable-400' },
];

interface LayerVisibilityToggleProps {
  map: import('maplibre-gl').Map | null;
}

export function LayerVisibilityToggle({ map }: LayerVisibilityToggleProps) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_LAYERS.map((l) => [l.id, true])),
  );
  const [open, setOpen] = useState(false);

  const toggle = (layerId: string) => {
    const newState = !visible[layerId];
    setVisible((v) => ({ ...v, [layerId]: newState }));
    if (map) {
      if (newState) {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
      } else {
        map.setLayoutProperty(layerId, 'visibility', 'none');
      }
    }
  };

  return (
    <div className="pointer-events-auto rounded-lg border border-brand-200 bg-white/95 shadow-md backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2"
      >
        <Layers className="h-3.5 w-3.5 text-brand-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
          Layers
        </span>
      </button>
      {open && (
        <ul className="space-y-1 border-t border-brand-100 p-2">
          {DEFAULT_LAYERS.map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                onClick={() => toggle(layer.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-brand-50',
                  visible[layer.id] ? 'text-brand-700' : 'text-brand-400',
                )}
              >
                <span className={cn('inline-block h-3 w-3 rounded-sm', layer.color, !visible[layer.id] && 'opacity-30')} />
                <span className="flex-1">{layer.label}</span>
                {visible[layer.id] ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
