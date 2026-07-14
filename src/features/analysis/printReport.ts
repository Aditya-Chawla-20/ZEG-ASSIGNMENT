import { useEffect, useRef } from 'react';

/**
 * Print a formatted analysis report. Opens a new window with a clean
 * printable summary and triggers the browser print dialog.
 */
export function printReport(
  parcelName: string,
  summary: import('@/types').AnalysisSummary,
  breakdown: import('@/types').BreakdownItem[],
  warnings: string[],
): void {
  const win = window.open('', '_blank', 'width=800,height=600');
  if (!win) return;

  const formatDate = () =>
    new Date().toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const rows = breakdown
    .map(
      (b) => `
      <tr>
        <td>${b.label}</td>
        <td style="text-align:center">${b.enabled ? 'Yes' : 'No'}</td>
        <td style="text-align:right">${b.bufferMeters > 0 ? `${b.bufferMeters} m` : '—'}</td>
        <td style="text-align:right">${b.uniquelyRemovedAcres.toFixed(2)}</td>
        <td style="text-align:right">${b.percentageOfParcel.toFixed(1)}%</td>
      </tr>`,
    )
    .join('');

  const warningHtml = warnings
    .map((w) => `<li>${w}</li>`)
    .join('');

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>LandScope Analysis Report — ${parcelName}</title>
  <style>
    * { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { margin: 2rem; color: #1e293b; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.1rem; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #475569; }
    .meta { color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }
    .summary { display: flex; gap: 2rem; margin-bottom: 1.5rem; }
    .summary div { text-align: center; }
    .summary .val { font-size: 1.75rem; font-weight: 700; }
    .summary .lbl { font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
    th { text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #64748b; padding: 0.5rem; border-bottom: 2px solid #e2e8f0; }
    td { padding: 0.5rem; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
    .disclaimer { margin-top: 2rem; padding: 1rem; background: #fef3c7; border-radius: 0.5rem; font-size: 0.8rem; color: #92400e; }
    .warnings { margin-top: 1rem; }
    .warnings li { color: #b45309; font-size: 0.85rem; margin-bottom: 0.25rem; }
    @media print { body { margin: 0.5in; } }
  </style>
</head>
<body>
  <h1>LandScope Buildable Land Analysis</h1>
  <div class="meta">Parcel: ${parcelName} · Generated: ${formatDate()}</div>

  <div class="summary">
    <div>
      <div class="val">${summary.parcelAcres.toFixed(2)}</div>
      <div class="lbl">Parcel (ac)</div>
    </div>
    <div>
      <div class="val" style="color:#dc2626">${summary.excludedAcres.toFixed(2)}</div>
      <div class="lbl">Excluded (ac)</div>
    </div>
    <div>
      <div class="val" style="color:#16a34a">${summary.buildableAcres.toFixed(2)}</div>
      <div class="lbl">Buildable (ac)</div>
    </div>
    <div>
      <div class="val" style="color:${summary.buildablePercentage >= 50 ? '#16a34a' : '#d97706'}">${summary.buildablePercentage.toFixed(1)}%</div>
      <div class="lbl">Buildable %</div>
    </div>
  </div>

  <h2>Constraint Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th>Constraint</th>
        <th style="text-align:center">Enabled</th>
        <th style="text-align:right">Buffer</th>
        <th style="text-align:right">Unique Removed (ac)</th>
        <th style="text-align:right">% of Parcel</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${warningHtml ? `<div class="warnings"><strong>Warnings:</strong><ul>${warningHtml}</ul></div>` : ''}

  <div class="disclaimer">
    <strong>Preliminary screening tool only.</strong> Results are not a legal, engineering, zoning,
    surveying, flood-certification, or wetland-delineation determination. All results require
    professional verification before any land use decision.
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`);
  win.document.close();
}

/**
 * Hook that exposes a print function. No-op when no result is available.
 */
export function usePrintReport(): {
  print: (
    parcelName: string,
    summary: import('@/types').AnalysisSummary,
    breakdown: import('@/types').BreakdownItem[],
    warnings: string[],
  ) => void;
} {
  const ref = useRef(printReport);
  useEffect(() => {
    ref.current = printReport;
  }, []);
  return { print: ref.current };
}
