import { useState, useCallback } from 'react';
import { Download, FileJson, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import type { AnalysisResult, AnalysisSummary } from '@/types';
import { cn } from '@/lib/utils';

interface ExportPanelProps {
  analysis: AnalysisResult | null;
  parcelId: string | null;
}

/**
 * Collapsible panel for exporting analysis results as GeoJSON or CSV.
 * Starts collapsed. Disabled (greyed out) when no analysis result is available.
 */
export function ExportPanel({ analysis, parcelId }: ExportPanelProps) {
  const [open, setOpen] = useState(false);

  const hasResult = !!analysis && !!parcelId;
  const disabled = !hasResult;

  const safeParcelId = parcelId ?? 'unknown';

  const handleGeoJSON = useCallback(() => {
    if (!analysis) return;
    const fc = buildGeoJSON(analysis);
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
    triggerDownload(blob, `landscope-analysis-${safeParcelId}.geojson`);
  }, [analysis, safeParcelId]);

  const handleCSV = useCallback(() => {
    if (!analysis) return;
    const csv = buildCSV(analysis);
    const blob = new Blob([csv], { type: 'text/csv' });
    triggerDownload(blob, `landscope-analysis-${safeParcelId}.csv`);
  }, [analysis, safeParcelId]);

  return (
    <div
      className={cn(
        'rounded-lg border border-brand-200 bg-white',
        disabled && 'opacity-50',
      )}
    >
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left',
          disabled
            ? 'cursor-not-allowed'
            : 'cursor-pointer hover:bg-brand-50',
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-brand-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            Export Results
          </span>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-brand-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-brand-400" />
        )}
      </button>

      {/* Body */}
      {open && hasResult && (
        <div className="flex flex-col gap-2 border-t border-brand-100 p-3">
          <button
            type="button"
            onClick={handleGeoJSON}
            className="flex items-center gap-2 rounded-md border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <FileJson className="h-4 w-4 text-brand-600" />
            Download GeoJSON
          </button>
          <button
            type="button"
            onClick={handleCSV}
            className="flex items-center gap-2 rounded-md border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          >
            <FileText className="h-4 w-4 text-brand-600" />
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GeoJSON builder
// ---------------------------------------------------------------------------

/**
 * Build a complete GeoJSON FeatureCollection from the analysis geometry layers.
 * Each feature carries a `kind` property, `acres` where computable, and the
 * summary fields from `analysis.summary`.
 */
function buildGeoJSON(analysis: AnalysisResult): GeoJSON.FeatureCollection {
  const g = analysis.geometry;
  const summary = analysis.summary;

  const features: GeoJSON.Feature[] = [];

  // Helper to push a feature with summary properties merged in.
  const pushFeature = (
    kind: string,
    geometry: GeoJSON.Geometry | null,
    acres?: number,
  ) => {
    if (!geometry) return;
    const properties: Record<string, unknown> = {
      kind,
      ...summaryToProperties(summary),
    };
    if (acres != null) {
      properties.acres = acres;
    }
    features.push({
      type: 'Feature',
      properties,
      geometry,
    });
  };

  // Parcel layer
  pushFeature('parcel', g.parcel, summary.parcelAcres);

  // Buildable layer
  pushFeature('buildable', g.buildable, summary.buildableAcres);

  // Excluded (effective) layer
  pushFeature('excluded', g.excluded, summary.excludedAcres);

  // Per-constraint layers
  for (const [constraintType, geom] of Object.entries(g.exclusionsByConstraint)) {
    const breakdownItem = analysis.breakdown.find(
      (b) => b.constraintType === constraintType,
    );
    pushFeature(
      constraintType,
      geom,
      breakdownItem?.uniquelyRemovedAcres,
    );
  }

  // Manual exclusions
  pushFeature('manual-exclusions', g.manualExclusions);

  // Manual restorations
  pushFeature('manual-restorations', g.manualRestorations);

  return {
    type: 'FeatureCollection',
    features,
  };
}

function summaryToProperties(summary: AnalysisSummary): Record<string, unknown> {
  return {
    parcelAcres: summary.parcelAcres,
    excludedAcres: summary.excludedAcres,
    buildableAcres: summary.buildableAcres,
    buildablePercentage: summary.buildablePercentage,
  };
}

// ---------------------------------------------------------------------------
// CSV builder
// ---------------------------------------------------------------------------

/**
 * Build a CSV string from the analysis breakdown.
 * Includes a summary section at the top, then the breakdown table with
 * columns: Constraint, Enabled, Buffer(m), Raw Intersection(ac),
 * Uniquely Removed(ac), % of Parcel, Reason.
 */
function buildCSV(analysis: AnalysisResult): string {
  const lines: string[] = [];

  // --- Summary section ---
  lines.push('# LandScope Analysis Summary');
  lines.push(`# Analysis ID,${csvEscape(analysis.analysisId)}`);
  const s = analysis.summary;
  lines.push(`# Parcel Acres,${s.parcelAcres.toFixed(4)}`);
  lines.push(`# Excluded Acres,${s.excludedAcres.toFixed(4)}`);
  lines.push(`# Buildable Acres,${s.buildableAcres.toFixed(4)}`);
  lines.push(`# Buildable Percentage,${s.buildablePercentage.toFixed(2)}`);
  lines.push(`# Analysis Duration (ms),${analysis.metrics.analysisDurationMs}`);
  lines.push(`# Candidate Constraint Features,${analysis.metrics.candidateConstraintFeatures}`);
  lines.push('#');
  if (analysis.warnings.length > 0) {
    lines.push('# Warnings:');
    for (const w of analysis.warnings) {
      lines.push(`#   - ${csvEscape(w)}`);
    }
    lines.push('#');
  }
  lines.push('');

  // --- Header row ---
  lines.push(
    [
      'Constraint',
      'Enabled',
      'Buffer(m)',
      'Raw Intersection(ac)',
      'Uniquely Removed(ac)',
      '% of Parcel',
      'Reason',
    ].join(','),
  );

  // --- Data rows ---
  for (const item of analysis.breakdown) {
    lines.push(
      [
        csvEscape(item.label),
        item.enabled ? 'true' : 'false',
        item.bufferMeters.toString(),
        item.rawIntersectionAcres.toFixed(4),
        item.uniquelyRemovedAcres.toFixed(4),
        item.percentageOfParcel.toFixed(2),
        csvEscape(item.reason),
      ].join(','),
    );
  }

  return lines.join('\n');
}

/**
 * Escape a value for CSV. Wraps in double quotes if it contains a comma,
 * double-quote, or newline. Existing double-quotes are doubled.
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick to ensure the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
