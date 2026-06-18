import { useCallback, useEffect, useRef, useState } from 'react';
import { routeKey, type RouteEstimate, type TravelMode } from '@/domain/routing';
import type { LatLng } from '@/domain/types';
import type { RoutingProvider } from '@/services/routing/RoutingProvider';
import { RoutingError, type RoutingErrorKind } from '@/services/routing/routingErrors';

export type RouteLegState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; kind: RoutingErrorKind };

interface UseRouteLegOptions {
  service: RoutingProvider | null;
  /** Called with the fresh estimate on success (parent persists + shows it). */
  onResult: (mode: TravelMode, estimate: RouteEstimate) => void;
}

/**
 * Drives one leg's route request: validation-free state machine with
 * single-flight de-duplication (ignores a repeat click for the same leg+mode
 * already in flight), abort of a superseded request, and abort on unmount.
 */
export function useRouteLeg({ service, onResult }: UseRouteLegOptions) {
  const [state, setState] = useState<RouteLegState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const loadingKeyRef = useRef<string | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const calculate = useCallback(
    async (from: LatLng, to: LatLng, mode: TravelMode) => {
      if (!service) return;
      // Public transit is never auto-calculated via Geoapify (its
      // approximated_transit data is unreliable here); the UI opens Google Maps
      // instead. Guard defensively so no transit request can ever be issued.
      if (mode === 'transit') return;
      const key = routeKey(from, to, mode);
      // Ignore a duplicate request for the same leg+mode already running.
      if (loadingKeyRef.current === key) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      loadingKeyRef.current = key;
      setState({ status: 'loading' });

      try {
        const estimate = await service.route({ from, to, mode, signal: controller.signal });
        if (controller.signal.aborted) return;
        loadingKeyRef.current = null;
        setState({ status: 'idle' });
        onResult(mode, estimate);
      } catch (error) {
        if (controller.signal.aborted) return;
        loadingKeyRef.current = null;
        const kind: RoutingErrorKind = error instanceof RoutingError ? error.kind : 'network';
        if (kind === 'aborted') return;
        setState({ status: 'error', kind });
      }
    },
    [service, onResult],
  );

  return { state, calculate };
}
