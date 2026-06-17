import type { RouteEstimate, RouteRequest } from '@/domain/routing';

/**
 * The seam between the app and any routing vendor. The UI talks to this
 * interface only; `GeoapifyRoutingProvider` is one implementation and the
 * caching service also implements it, so either can be swapped in.
 */
export interface RoutingProvider {
  /** Compute a single route between two points for one travel mode. */
  route(request: RouteRequest): Promise<RouteEstimate>;
}

/** Injectable `fetch` so providers can be unit-tested without the network. */
export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;
