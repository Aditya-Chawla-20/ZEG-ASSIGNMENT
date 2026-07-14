import { useState } from 'react';
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { saveAnalysis } from '@/api/client';
import { useAppStore } from '@/stores/appStore';
import type { AnalysisResult } from '@/types';

interface SaveAnalysisButtonProps {
  result: AnalysisResult | null;
  parcelName: string;
}

export function SaveAnalysisButton({ result, parcelName }: SaveAnalysisButtonProps) {
  const selectedParcelId = useAppStore((s) => s.selectedParcelId);
  const analysisSettings = useAppStore((s) => s.analysisSettings);
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!result || !selectedParcelId) return;
      await saveAnalysis(result, selectedParcelId, parcelName, analysisSettings);
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  if (!result || !selectedParcelId) return null;

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending || saved}
      className="flex items-center gap-1.5 rounded-md border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
    >
      {mutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="h-3.5 w-3.5 text-buildable-600" />
      ) : (
        <Bookmark className="h-3.5 w-3.5" />
      )}
      {saved ? 'Saved!' : 'Save Analysis'}
    </button>
  );
}
