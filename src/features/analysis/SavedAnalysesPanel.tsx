import { useState } from 'react';
import { Bookmark, Trash2, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listSavedAnalyses,
  deleteSavedAnalysis,
  type SavedAnalysis,
} from '@/api/client';

interface SavedAnalysesPanelProps {
  onSelect: (saved: SavedAnalysis) => void;
}

export function SavedAnalysesPanel({ onSelect }: SavedAnalysesPanelProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: saved = [] } = useQuery({
    queryKey: ['saved-analyses'],
    queryFn: listSavedAnalyses,
    staleTime: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSavedAnalysis,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-analyses'] });
    },
  });

  return (
    <div className="rounded-lg border border-brand-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Bookmark className="h-3.5 w-3.5 text-brand-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Saved Analyses
          </span>
          {saved.length > 0 && (
            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
              {saved.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-brand-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-brand-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-brand-100 p-3">
          {saved.length === 0 ? (
            <p className="text-xs text-brand-400">
              No saved analyses yet. Run an analysis and save it to revisit later.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {saved.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50/50 p-2 hover:bg-brand-50"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s)}
                    className="flex flex-1 items-start gap-2 text-left"
                  >
                    <Clock className="mt-0.5 h-3 w-3 shrink-0 text-brand-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-brand-800">
                        {s.parcelName}
                      </div>
                      <div className="text-[11px] text-brand-500">
                        {new Date(s.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {s.summary.buildableAcres.toFixed(1)} ac buildable
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(s.id);
                    }}
                    className="rounded p-1 text-brand-400 opacity-0 transition-opacity hover:bg-excluded-50 hover:text-excluded-600 group-hover:opacity-100"
                    aria-label="Delete saved analysis"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
