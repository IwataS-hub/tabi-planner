import { z } from 'zod';
import { geoapifyRoutingMode, type RouteEstimate, type RouteRequest } from '@/domain/routing';
import type { LatLng } from '@/domain/types';
import type { FetchLike, RoutingProvider } from './RoutingProvider';
import { RoutingError, statusToRoutingErrorKind } from './routingErrors';

const GEOAPIFY_ROUTING_URL = 'https://api.geoapify.com/v1/routing';
const DEFAULT_TIMEOUT_MS = 9000;

// ---------------------------------------------------------------------------
// Response validation (Geoapify routing returns a GeoJSON FeatureCollection)
// ---------------------------------------------------------------------------

const nonNegativeFinite = z
  .number()
  .refine(Number.isFinite, '数値が不正です')
  .refine((v) => v >= 0, '負の値は不正です');

// A GeoJSON position is [lon, lat] (an optional 3rd elevation value is ignored).
const positionSchema = z.array(z.number().refine(Number.isFinite, '座標が不正です')).min(2);

const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: z.array(positionSchema) }),
  z.object({
    type: z.literal('MultiLineString'),
    coordinates: z.array(z.array(positionSchema)),
  }),
]);

const featureSchema = z.object({
  properties: z.object({
    distance: nonNegativeFinite,
    time: nonNegativeFinite,
  }),
  geometry: geometrySchema,
});

const routingResponseSchema = z.object({
  features: z.array(featureSchema),
});

type RoutingFeature = z.infer<typeof featureSchema>;

function isEmptyRouteEnvelope(json: unknown): boolean {
  if (typeof json !== 'object' || json === null) return false;
  const envelope = json as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(envelope, 'features')) {
    return Array.isArray(envelope.features) && envelope.features.length === 0;
  }
  if (Object.prototype.hasOwnProperty.call(envelope, 'results')) {
    return Array.isArray(envelope.results) && envelope.results.length === 0;
  }
  return false;
}

/**
 * Geoapify returns HTTP 200 with an embedded error object when no transit path
 * can be found (e.g. { statusCode: 400, error: "Bad Request", message: "No
 * path could be found for input" }). Treat these as no-route, not as a
 * structural parse failure.
 */
function isEmbeddedErrorResponse(json: unknown): boolean {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return false;
  const obj = json as Record<string, unknown>;
  return (
    typeof obj.statusCode === 'number' &&
    typeof obj.error === 'string' &&
    typeof obj.message === 'string'
  );
}

/** Flatten LineString / MultiLineString coordinates into validated LatLng[]. */
function toGeometry(feature: RoutingFeature): LatLng[] {
  const lines =
    feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const points: LatLng[] = [];
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new RoutingError('invalid-response');
      }
      points.push({ latitude: lat, longitude: lon });
    }
  }
  return points;
}

// ---------------------------------------------------------------------------
// Timeout + caller-abort plumbing (kept local so routing has no cross-service deps)
// ---------------------------------------------------------------------------

interface LinkedSignal {
  signal: AbortSignal;
  cleanup: () => void;
  timedOut: () => boolean;
}

function linkSignals(external: AbortSignal | undefined, timeoutMs: number): LinkedSignal {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
    timedOut: () => didTimeout,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === 'AbortError';
  return error instanceof Error && error.name === 'AbortError';
}

export interface GeoapifyRoutingProviderOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/**
 * Geoapify Routing API implementation. Exactly two waypoints are sent; no
 * advanced details, elevation, avoid rules, or optimization are requested. All
 * URL construction lives in `buildUrl`; the API key is appended there and never
 * logged or placed into a thrown error.
 */
export class GeoapifyRoutingProvider implements RoutingProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: GeoapifyRoutingProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Build the request URL. The only place the key and waypoints are attached. */
  private buildUrl(request: RouteRequest): string {
    const url = new URL(GEOAPIFY_ROUTING_URL);
    // Exactly two waypoints: "lat,lon|lat,lon".
    url.searchParams.set(
      'waypoints',
      `${request.from.latitude},${request.from.longitude}|${request.to.latitude},${request.to.longitude}`,
    );
    url.searchParams.set('mode', geoapifyRoutingMode(request.mode));
    url.searchParams.set('lang', 'ja');
    url.searchParams.set('units', 'metric');
    url.searchParams.set('format', 'geojson');
    url.searchParams.set('apiKey', this.apiKey);
    return url.toString();
  }

  async route(request: RouteRequest): Promise<RouteEstimate> {
    const linked = linkSignals(request.signal, this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.buildUrl(request), { signal: linked.signal });
    } catch (error) {
      if (isAbortError(error)) {
        if (linked.timedOut()) throw new RoutingError('timeout');
        throw new RoutingError('aborted');
      }
      throw new RoutingError('network', undefined, error);
    } finally {
      linked.cleanup();
    }

    if (!response.ok) {
      throw new RoutingError(statusToRoutingErrorKind(response.status));
    }

    let json: unknown;
    try {
      json = (await response.json()) as unknown;
    } catch (error) {
      throw new RoutingError('invalid-response', undefined, error);
    }

    if (isEmptyRouteEnvelope(json)) throw new RoutingError('no-route');
    if (isEmbeddedErrorResponse(json)) throw new RoutingError('no-route');

    const parsed = routingResponseSchema.safeParse(json);
    if (!parsed.success) throw new RoutingError('invalid-response', undefined, parsed.error);

    const feature = parsed.data.features[0];
    if (!feature) throw new RoutingError('no-route');

    const geometry = toGeometry(feature);
    if (geometry.length < 2) throw new RoutingError('no-route');

    return {
      timeSeconds: feature.properties.time,
      distanceMeters: feature.properties.distance,
      geometry,
    };
  }
}
