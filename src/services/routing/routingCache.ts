import type { RouteEstimate } from '@/domain/routing';
import { TtlCache } from '@/services/geocoding/geocodingCache';

/**
 * In-memory cache for route estimates, so re-computing the same leg+mode does
 * not spend another API request. Reuses the generic TTL+LRU cache. The cache
 * key is the leg's {@link routeKey} (from/to coords + mode) — it never contains
 * the API key or a request URL. Nothing here is persisted; it clears on reload.
 */

export const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const ROUTE_CACHE_MAX_ENTRIES = 50;

export function createRouteCache(now?: () => number): TtlCache<RouteEstimate> {
  return new TtlCache<RouteEstimate>({
    ttlMs: ROUTE_CACHE_TTL_MS,
    maxEntries: ROUTE_CACHE_MAX_ENTRIES,
    now,
  });
}

export { TtlCache };
