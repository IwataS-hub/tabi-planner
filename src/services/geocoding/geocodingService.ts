import {
  PLACE_SEARCH_RESULT_LIMIT,
  type GeoPlace,
  type ReverseGeocodeOptions,
  type ReverseGeocodeResult,
  type SearchPlacesOptions,
} from '@/domain/geocoding';
import { getGeoapifyApiKey } from '@/config/environment';
import type { FetchLike, GeocodingProvider } from './GeocodingProvider';
import { GeoapifyGeocodingProvider } from './GeoapifyGeocodingProvider';
import {
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_TTL_MS,
  TtlCache,
  searchCacheKey,
} from './geocodingCache';

/**
 * Wraps any provider with an in-memory result cache for forward searches, so an
 * identical query+conditions is not re-sent within its TTL. Reverse geocoding
 * is left uncached (it runs once per map click on fresh coordinates).
 */
export class CachingGeocodingService implements GeocodingProvider {
  private readonly provider: GeocodingProvider;
  private readonly cache: TtlCache<GeoPlace[]>;

  constructor(provider: GeocodingProvider, cache?: TtlCache<GeoPlace[]>) {
    this.provider = provider;
    this.cache =
      cache ??
      new TtlCache<GeoPlace[]>({
        ttlMs: SEARCH_CACHE_TTL_MS,
        maxEntries: SEARCH_CACHE_MAX_ENTRIES,
      });
  }

  async search(options: SearchPlacesOptions): Promise<GeoPlace[]> {
    const limit = options.limit ?? PLACE_SEARCH_RESULT_LIMIT;
    const key = searchCacheKey({ query: options.query, limit, bias: options.bias });
    const cached = this.cache.get(key);
    if (cached) return cached;
    const results = await this.provider.search({ ...options, limit });
    this.cache.set(key, results);
    return results;
  }

  reverse(options: ReverseGeocodeOptions): Promise<ReverseGeocodeResult> {
    return this.provider.reverse(options);
  }
}

export interface CreateGeoapifyServiceOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  cache?: TtlCache<GeoPlace[]>;
}

/** Build a cache-wrapped Geoapify service (used by the singleton and tests). */
export function createGeoapifyService(
  options: CreateGeoapifyServiceOptions,
): CachingGeocodingService {
  const provider = new GeoapifyGeocodingProvider({
    apiKey: options.apiKey,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  return new CachingGeocodingService(provider, options.cache);
}

// Singleton, created lazily from the environment. `undefined` = not yet
// resolved; `null` = resolved but no API key (search disabled, app still works).
let singleton: CachingGeocodingService | null | undefined;

/**
 * The app-wide geocoding service, or `null` when no API key is configured.
 * Callers must handle `null` (search UI shows a gentle "not configured" note;
 * reverse geocoding is simply skipped).
 */
export function getGeocodingService(): GeocodingProvider | null {
  if (singleton === undefined) {
    const apiKey = getGeoapifyApiKey();
    singleton = apiKey ? createGeoapifyService({ apiKey }) : null;
  }
  return singleton;
}
