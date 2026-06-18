import { routeKey, type RouteEstimate, type RouteRequest } from '@/domain/routing';
import { getGeoapifyApiKey } from '@/config/environment';
import type { TtlCache } from '@/services/geocoding/geocodingCache';
import type { FetchLike, RoutingProvider } from './RoutingProvider';
import { GeoapifyRoutingProvider } from './GeoapifyRoutingProvider';
import { createRouteCache } from './routingCache';
import { RoutingError } from './routingErrors';

function abortable<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new RoutingError('aborted'));
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new RoutingError('aborted')), { once: true });
    }),
  ]);
}

/**
 * Wraps a routing provider with an in-memory cache keyed by leg+mode, so an
 * identical re-calculation is served without another API request. A cache hit
 * is returned exactly like a fresh result (the UI cannot tell them apart).
 */
export class CachingRoutingService implements RoutingProvider {
  private readonly provider: RoutingProvider;
  private readonly cache: TtlCache<RouteEstimate>;
  private readonly inFlight = new Map<string, Promise<RouteEstimate>>();

  constructor(provider: RoutingProvider, cache?: TtlCache<RouteEstimate>) {
    this.provider = provider;
    this.cache = cache ?? createRouteCache();
  }

  async route(request: RouteRequest): Promise<RouteEstimate> {
    const key = routeKey(request.from, request.to, request.mode);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const running = this.inFlight.get(key);
    if (running) return abortable(running, request.signal);

    const requestPromise = this.provider
      .route({ from: request.from, to: request.to, mode: request.mode })
      .then((result) => {
        this.cache.set(key, result);
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, requestPromise);
    return abortable(requestPromise, request.signal);
  }
}

export interface CreateGeoapifyRoutingServiceOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  cache?: TtlCache<RouteEstimate>;
}

export function createGeoapifyRoutingService(
  options: CreateGeoapifyRoutingServiceOptions,
): CachingRoutingService {
  const provider = new GeoapifyRoutingProvider({
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  return new CachingRoutingService(provider, options.cache);
}

// Lazily-resolved singleton. `undefined` = not resolved yet; `null` = no key
// (routing disabled, manual entry still works).
let singleton: CachingRoutingService | null | undefined;

/**
 * The app-wide routing service, or `null` when no API key is configured.
 * Uses the same `VITE_GEOAPIFY_API_KEY` as search/reverse geocoding.
 */
export function getRoutingService(): RoutingProvider | null {
  if (singleton === undefined) {
    const apiKey = getGeoapifyApiKey();
    singleton = apiKey ? createGeoapifyRoutingService({ apiKey }) : null;
  }
  return singleton;
}
