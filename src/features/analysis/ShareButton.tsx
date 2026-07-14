import { useState, useRef, useCallback } from 'react';
import { Link2, Check } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import type { ConstraintConfig } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Share / permalink button. Builds a URL with query params encoding the
 * current state (selected parcel + constraint settings), copies it to
 * the clipboard, and shows a transient "Copied!" state on the button.
 */
export function ShareButton() {
  const selectedParcelId = useAppStore((s) => s.selectedParcelId);
  const analysisSettings = useAppStore((s) => s.analysisSettings);

  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  const disabled = !selectedParcelId;

  const handleShare = useCallback(() => {
    if (!selectedParcelId) return;

    const url = buildShareUrl(selectedParcelId, analysisSettings);

    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // If clipboard fails, do nothing — the button stays in default state.
      });
  }, [selectedParcelId, analysisSettings]);

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={disabled}
      title="Copy a permalink to the current analysis state"
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
        copied
          ? 'border-buildable-300 bg-buildable-50 text-buildable-700'
          : 'border-brand-200 bg-white text-brand-700 hover:bg-brand-50',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Link2 className="h-3.5 w-3.5" />
      )}
      {copied ? 'Copied!' : 'Share'}
    </button>
  );
}

/**
 * Build a shareable URL with query params:
 *  - p = selectedParcelId
 *  - c = base64(JSON.stringify(analysisSettings))
 */
function buildShareUrl(
  parcelId: string,
  settings: ConstraintConfig[],
): string {
  const params = new URLSearchParams();
  params.set('p', parcelId);
  params.set('c', base64Encode(JSON.stringify(settings)));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/**
 * UTF-8 safe base64 encoder for browser environments.
 */
function base64Encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
