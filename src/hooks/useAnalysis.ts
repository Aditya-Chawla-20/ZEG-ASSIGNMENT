import { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { runAnalysis, type ApiError } from '@/api/client';
import { useAppStore, analysisInputKey, buildAnalysisRequest } from '@/stores/appStore';
import type { AnalysisRequest, AnalysisResult } from '@/types';

interface UseAnalysisResult {
  result: AnalysisResult | null;
  /** True only on the first load for a given parcel (no result yet). */
  isLoading: boolean;
  /** True whenever a (re)calculation is in flight, including stale refetches. */
  isCalculating: boolean;
  error: ApiError | null;
  /** Manually trigger an analysis run. */
  runAnalysisNow: () => void;
}

/**
 * Debounced auto-run analysis.
 *
 * Watches the parcel id, constraint settings, and manual edits. When any of
 * those change, waits 300ms, then POSTs /api/v1/analyses. Uses AbortController
 * to cancel stale requests.
 */
export function useAnalysis(): UseAnalysisResult {
  const selectedParcelId = useAppStore((s) => s.selectedParcelId);
  const analysisSettings = useAppStore((s) => s.analysisSettings);
  const manualExclusions = useAppStore((s) => s.manualExclusions);
  const manualRestorations = useAppStore((s) => s.manualRestorations);

  const inputKey = analysisInputKey({
    selectedParcelId,
    analysisSettings,
    manualExclusions,
    manualRestorations,
  });

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasResultForParcel, setHasResultForParcel] = useState(false);

  // Track the current in-flight AbortController so we can cancel stale requests.
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const lastRunKey = useRef<string>('');
  // Track which parcel we last had a result for, to drive the "initial loading" state.
  const resultParcelId = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (req: AnalysisRequest & { signal: AbortSignal }) => {
      const { signal, ...payload } = req;
      return runAnalysis(payload, signal);
    },
    onSuccess: (data, variables) => {
      if (variables.signal.aborted) return;
      setResult(data);
      setError(null);
      setIsCalculating(false);
      resultParcelId.current = variables.parcelId;
      setHasResultForParcel(true);
    },
    onError: (err: ApiError, variables) => {
      if (variables.signal.aborted) return;
      setError(err);
      setIsCalculating(false);
      // Keep previous result visible on error so the map doesn't blank out.
    },
  });

  const trigger = useCallback(() => {
    if (!selectedParcelId) {
      setResult(null);
      setError(null);
      setIsCalculating(false);
      setHasResultForParcel(false);
      resultParcelId.current = null;
      lastRunKey.current = '';
      return;
    }

    // Cancel any pending request.
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const payload = buildAnalysisRequest({
      selectedParcelId,
      analysisSettings,
      manualExclusions,
      manualRestorations,
    });

    setIsCalculating(true);
    lastRunKey.current = inputKey;

    mutation.mutate({ ...payload, signal: controller.signal });
  }, [selectedParcelId, analysisSettings, manualExclusions, manualRestorations, inputKey, mutation]);

  // Reset result when parcel changes (so initial-loading state shows).
  useEffect(() => {
    if (selectedParcelId !== resultParcelId.current) {
      setHasResultForParcel(false);
    }
  }, [selectedParcelId]);

  // Debounced auto-run on input change.
  useEffect(() => {
    if (!selectedParcelId) {
      // Clear everything when no parcel.
      if (abortRef.current) abortRef.current.abort();
      setResult(null);
      setError(null);
      setIsCalculating(false);
      setHasResultForParcel(false);
      lastRunKey.current = '';
      return;
    }

    if (inputKey === lastRunKey.current) return; // nothing changed

    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = window.setTimeout(() => {
      trigger();
    }, 300);

    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
  }, [inputKey, selectedParcelId, trigger]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    };
  }, []);

  const isLoading = !!selectedParcelId && !hasResultForParcel && !error;
  const runAnalysisNow = useCallback(() => {
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    trigger();
  }, [trigger]);

  return { result, isLoading, isCalculating, error, runAnalysisNow };
}
