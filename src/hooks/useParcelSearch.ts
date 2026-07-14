import { useEffect, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchParcels } from '@/api/client';
import { useDebouncedValue } from './useDebouncedValue';

export interface UseParcelSearchArgs {
  /** Minimum query length before searching. */
  minQueryLength?: number;
  debounceMs?: number;
  limit?: number;
}

/**
 * Debounced parcel search backed by TanStack Query.
 * Returns the current input value + setter so callers can bind directly.
 */
export function useParcelSearch({
  minQueryLength = 2,
  debounceMs = 300,
  limit = 20,
}: UseParcelSearchArgs = {}) {
  const [input, setInput] = useState('');
  const debounced = useDebouncedValue(input, debounceMs);
  const enabled = debounced.trim().length >= minQueryLength;

  // Track whether we've ever searched, for "no results" UX.
  const hasSearched = useRef(false);

  const query = useQuery({
    queryKey: ['parcels', debounced, limit],
    queryFn: ({ signal }) => searchParcels(debounced, undefined, limit, 0, signal),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (enabled) hasSearched.current = true;
  }, [enabled]);

  return {
    input,
    setInput,
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isFetching && enabled,
    isError: query.isError,
    error: query.error,
    hasSearched: hasSearched.current,
    enabled,
  };
}
