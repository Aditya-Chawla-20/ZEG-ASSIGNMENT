import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

/**
 * Prominent disclaimer banner. Dismissible for the session but stays visible
 * by default so users always see the screening-tool caveat.
 */
export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-floodplain-300 bg-floodplain-50 px-3 py-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-floodplain-600" />
      <p className="flex-1 text-xs leading-relaxed text-floodplain-800">
        <span className="font-semibold">Preliminary screening tool only.</span>{' '}
        Results are not a legal, engineering, zoning, surveying, flood-certification, or
        wetland-delineation determination. All results require professional verification before
        any land use decision.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded p-0.5 text-floodplain-500 hover:bg-floodplain-100 hover:text-floodplain-700"
        aria-label="Dismiss disclaimer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
