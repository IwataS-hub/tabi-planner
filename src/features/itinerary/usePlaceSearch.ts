import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MIN_SEARCH_QUERY_LENGTH,
  PLACE_SEARCH_RESULT_LIMIT,
  type BiasCenter,
  type GeoPlace,
} from '@/domain/geocoding';
import type { GeocodingProvider } from '@/services/geocoding/GeocodingProvider';
import { GeocodingError, type GeocodingErrorKind } from '@/services/geocoding/geocodingErrors';

export type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'too-short' }
  | { status: 'loading' }
  | { status: 'success'; results: GeoPlace[]; query: string }
  | { status: 'error'; kind: GeocodingErrorKind };

interface UsePlaceSearchOptions {
  /** The geocoding service, or null when no API key is configured. */
  service: GeocodingProvider | null;
  /** Current map-center bias, resolved lazily at search time. */
  getBias?: () => BiasCenter | null;
}

/**
 * Owns the search request lifecycle: input validation, a clear state machine,
 * single-flight de-duplication, and aborting a superseded request. The UI layer
 * stays declarative and just renders `state`.
 */
export function usePlaceSearch({ service, getBias }: UsePlaceSearchOptions) {
  const [state, setState] = useState<PlaceSearchState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const loadingQueryRef = useRef<string | null>(null);

  // Cancel any in-flight request if the component unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const search = useCallback(
    async (rawQuery: string) => {
      if (!service) return;
      const query = rawQuery.trim();

      // Too short → no network call, just a gentle hint.
      if (query.length < MIN_SEARCH_QUERY_LENGTH) {
        abortRef.current?.abort();
        abortRef.current = null;
        loadingQueryRef.current = null;
        setState({ status: 'too-short' });
        return;
      }

      // Ignore a repeat of the request already in flight (button mashing).
      if (loadingQueryRef.current === query) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      loadingQueryRef.current = query;
      setState({ status: 'loading' });

      try {
        const results = await service.search({
          query,
          limit: PLACE_SEARCH_RESULT_LIMIT,
          bias: getBias?.() ?? null,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return; // superseded by a newer search
        loadingQueryRef.current = null;
        setState({ status: 'success', results, query });
      } catch (error) {
        if (controller.signal.aborted) return;
        loadingQueryRef.current = null;
        const kind: GeocodingErrorKind = error instanceof GeocodingError ? error.kind : 'network';
        if (kind === 'aborted') return;
        setState({ status: 'error', kind });
      }
    },
    [service, getBias],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    loadingQueryRef.current = null;
    setState({ status: 'idle' });
  }, []);

  return { state, search, reset };
}
