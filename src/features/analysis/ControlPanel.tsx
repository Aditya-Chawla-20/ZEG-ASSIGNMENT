import { useState } from 'react';
import {
  Layers,
  RotateCcw,
  MousePointer2,
  Square,
  Sparkles,
  Undo2,
  Trash2,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { ConstraintConfigResponse, ConstraintUIConfig, ParcelSummary, ConstraintConfig } from '@/types';
import { KeyboardShortcutsHelp } from '@/features/analysis/KeyboardShortcutsHelp';
import { cn } from '@/lib/utils';

interface ControlPanelProps {
  constraintConfig: ConstraintConfigResponse | null;
  parcel: ParcelSummary | null;
}

export function ControlPanel({ constraintConfig, parcel }: ControlPanelProps) {
  const analysisSettings = useAppStore((s) => s.analysisSettings);
  const updateConstraint = useAppStore((s) => s.updateConstraint);
  const resetConstraints = useAppStore((s) => s.resetConstraints);
  const drawMode = useAppStore((s) => s.drawMode);
  const setDrawMode = useAppStore((s) => s.setDrawMode);
  const undoLastEdit = useAppStore((s) => s.undoLastEdit);
  const clearManualEdits = useAppStore((s) => s.clearManualEdits);
  const undoStack = useAppStore((s) => s.undoStack);
  const manualExclusions = useAppStore((s) => s.manualExclusions);
  const manualRestorations = useAppStore((s) => s.manualRestorations);

  const [showClassifications, setShowClassifications] = useState(true);

  const configs = constraintConfig?.constraints ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* --- Header --- */}
      <div>
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
            Analysis Controls
          </h2>
        </div>
        {parcel && (
          <div className="mt-2 rounded-md border border-brand-200 bg-brand-50 p-2.5">
            <div className="truncate text-sm font-medium text-brand-800" title={parcel.displayName}>
              {parcel.displayName}
            </div>
            <div className="mt-0.5 text-xs text-brand-500">
              {parcel.countyName}
              {parcel.sourceAreaAcres != null && ` · ${parcel.sourceAreaAcres.toFixed(2)} ac`}
            </div>
          </div>
        )}
      </div>

      {/* --- Constraint layers --- */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
            Constraint Layers
          </span>
          <button
            type="button"
            onClick={() => resetConstraints(configs)}
            disabled={configs.length === 0}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-brand-500 hover:bg-brand-100 hover:text-brand-700 disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to Defaults
          </button>
        </div>

        <div className="space-y-2">
          {configs.map((cfg) => (
            <ConstraintControl
              key={cfg.type}
              cfg={cfg}
              current={analysisSettings.find((c) => c.type === cfg.type) ?? null}
              onToggle={(enabled) => updateConstraint(cfg.type, { enabled })}
              onBuffer={(bufferMeters) => updateConstraint(cfg.type, { bufferMeters })}
              onClassification={(classifications) =>
                updateConstraint(cfg.type, { classifications })
              }
              showClassifications={showClassifications}
              toggleClassifications={() => setShowClassifications((s) => !s)}
            />
          ))}
          {configs.length === 0 && (
            <p className="text-xs text-brand-400">Loading constraint configuration…</p>
          )}
        </div>
      </div>

      {/* --- Divider --- */}
      <hr className="border-brand-100" />

      {/* --- Manual Edit Tools --- */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Sliders className="h-3.5 w-3.5 text-brand-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
            Manual Edit Tools
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <DrawToolButton
            active={drawMode === 'pan'}
            onClick={() => setDrawMode('pan')}
            icon={MousePointer2}
            label="Pan / Inspect"
          />
          <DrawToolButton
            active={drawMode === 'exclude'}
            onClick={() => setDrawMode('exclude')}
            icon={Square}
            label="Draw Exclusion"
            tone="excluded"
          />
          <DrawToolButton
            active={drawMode === 'restore'}
            onClick={() => setDrawMode('restore')}
            icon={Sparkles}
            label="Draw Restoration"
            tone="buildable"
          />
        </div>

        <KeyboardShortcutsHelp visible={!!parcel} />

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={undoLastEdit}
            disabled={undoStack.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-md border border-brand-200 bg-white px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo Last Edit
          </button>
          <button
            type="button"
            onClick={clearManualEdits}
            disabled={manualExclusions.features.length === 0 && manualRestorations.features.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-md border border-brand-200 bg-white px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All Edits
          </button>
        </div>

        {/* Draw mode indicator */}
        <div className="mt-2 flex items-center gap-2 rounded-md bg-brand-50 px-2.5 py-1.5">
          <span className="text-xs text-brand-500">Mode:</span>
          <span
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              drawMode === 'exclude' && 'text-excluded-700',
              drawMode === 'restore' && 'text-buildable-700',
              drawMode === 'pan' && 'text-brand-700',
            )}
          >
            {drawMode === 'pan' && <MousePointer2 className="h-3 w-3" />}
            {drawMode === 'exclude' && <Square className="h-3 w-3" />}
            {drawMode === 'restore' && <Sparkles className="h-3 w-3" />}
            {drawMode === 'pan' && 'Pan / Inspect'}
            {drawMode === 'exclude' && 'Drawing Exclusion'}
            {drawMode === 'restore' && 'Drawing Restoration'}
          </span>
        </div>

        {(manualExclusions.features.length > 0 || manualRestorations.features.length > 0) && (
          <div className="mt-2 flex items-center gap-3 text-xs text-brand-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-excluded-500" />
              {manualExclusions.features.length} exclusion{manualExclusions.features.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-buildable-500" />
              {manualRestorations.features.length} restoration{manualRestorations.features.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface DrawToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof MousePointer2;
  label: string;
  tone?: 'excluded' | 'buildable';
}

function DrawToolButton({ active, onClick, icon: Icon, label, tone }: DrawToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-xs font-medium transition-colors',
        active
          ? tone === 'excluded'
            ? 'border-excluded-500 bg-excluded-50 text-excluded-700'
            : tone === 'buildable'
              ? 'border-buildable-500 bg-buildable-50 text-buildable-700'
              : 'border-brand-500 bg-brand-100 text-brand-800'
          : 'border-brand-200 bg-white text-brand-600 hover:bg-brand-50',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

interface ConstraintControlProps {
  cfg: ConstraintUIConfig;
  current: ConstraintConfig | null;
  onToggle: (enabled: boolean) => void;
  onBuffer: (bufferMeters: number) => void;
  onClassification: (classifications: string[]) => void;
  showClassifications: boolean;
  toggleClassifications: () => void;
}

function ConstraintControl({
  cfg,
  current,
  onToggle,
  onBuffer,
  onClassification,
}: ConstraintControlProps) {
  const enabled = current?.enabled ?? cfg.defaultEnabled;
  const buffer = current?.bufferMeters ?? cfg.defaultBufferMeters;
  const classifications = current?.classifications ?? [];

  const colorMap: Record<string, { dot: string; ring: string }> = {
    wetlands: { dot: 'bg-wetlands-500', ring: 'focus:ring-wetlands-400' },
    floodplain: { dot: 'bg-floodplain-500', ring: 'focus:ring-floodplain-400' },
    transmission: { dot: 'bg-transmission-500', ring: 'focus:ring-transmission-400' },
  };
  const colors = colorMap[cfg.type] ?? { dot: 'bg-brand-500', ring: 'focus:ring-brand-400' };

  const toggleClassification = (c: string) => {
    const set = new Set<string>(classifications);
    if (set.has(c)) set.delete(c);
    else set.add(c);
    onClassification(Array.from(set));
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 transition-colors',
        enabled ? 'border-brand-200 bg-white' : 'border-brand-100 bg-brand-50/50',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('inline-block h-2.5 w-2.5 rounded-full', colors.dot, !enabled && 'opacity-30')} />
          <span className={cn('text-sm font-medium', enabled ? 'text-brand-800' : 'text-brand-400')}>
            {cfg.label}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1',
            colors.ring,
            enabled ? 'bg-brand-600' : 'bg-brand-300',
          )}
          aria-label={`Toggle ${cfg.label}`}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-2.5 space-y-2">
          {/* Buffer slider + number */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-brand-500">Buffer distance</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={cfg.minBuffer}
                  max={cfg.maxBuffer}
                  value={buffer}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) {
                      onBuffer(Math.max(cfg.minBuffer, Math.min(cfg.maxBuffer, v)));
                    }
                  }}
                  className="w-16 rounded border border-brand-200 px-1.5 py-0.5 text-right text-xs tabular-nums text-brand-700 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
                />
                <span className="text-xs text-brand-400">m</span>
              </div>
            </div>
            <input
              type="range"
              min={cfg.minBuffer}
              max={cfg.maxBuffer}
              step={cfg.maxBuffer <= 500 ? 5 : 10}
              value={buffer}
              onChange={(e) => onBuffer(Number(e.target.value))}
              className="mt-1.5 w-full accent-brand-600"
            />
          </div>

          {/* Flood classifications (floodplain only) */}
          {cfg.supportedClassifications.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-brand-500">Flood classifications</div>
              <div className="flex flex-wrap gap-1">
                {cfg.supportedClassifications.map((c) => {
                  const active = classifications.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleClassification(c)}
                      className={cn(
                        'rounded border px-1.5 py-0.5 text-xs font-medium transition-colors',
                        active
                          ? 'border-floodplain-500 bg-floodplain-100 text-floodplain-700'
                          : 'border-brand-200 bg-white text-brand-500 hover:bg-brand-50',
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-brand-400">
                {classifications.length === 0
                  ? 'None selected — all classifications excluded.'
                  : `${classifications.length} selected`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
