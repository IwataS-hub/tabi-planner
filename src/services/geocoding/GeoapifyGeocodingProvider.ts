import { z } from 'zod';
import {
  GEOCODING_COUNTRY_CODE,
  GEOCODING_LANGUAGE,
  PLACE_SEARCH_RESULT_LIMIT,
  type GeoPlace,
  type ReverseGeocodeOptions,
  type ReverseGeocodeResult,
  type SearchPlacesOptions,
} from '@/domain/geocoding';
import { PLACE_ADDRESS_MAX_LENGTH } from '@/domain/types';
import type { FetchLike, GeocodingProvider } from './GeocodingProvider';
import { GeocodingError, statusToErrorKind } from './geocodingErrors';

const GEOAPIFY_BASE = 'https://api.geoapify.com/v1/geocode';
const DEFAULT_TIMEOUT_MS = 9000;

// ---------------------------------------------------------------------------
// Response validation (Geoapify returns GeoJSON FeatureCollection)
// ---------------------------------------------------------------------------

const finiteNumber = z.number().refine(Number.isFinite, '数値が不正です');
const latitude = finiteNumber.refine((v) => v >= -90 && v <= 90, '緯度が範囲外です');
const longitude = finiteNumber.refine((v) => v >= -180 && v <= 180, '経度が範囲外です');

const featureSchema = z.object({
  properties: z.object({
    place_id: z.string().optional(),
    name: z.string().optional(),
    formatted: z.string().optional(),
    address_line1: z.string().optional(),
    address_line2: z.string().optional(),
    city: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    country_code: z.string().optional(),
    result_type: z.string().optional(),
    category: z.string().optional(),
    lat: latitude,
    lon: longitude,
  }),
});

const featureCollectionSchema = z.object({
  features: z.array(featureSchema),
});

type GeoapifyFeature = z.infer<typeof featureSchema>;

// ---------------------------------------------------------------------------
// result_type → friendly Japanese kind label
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  amenity: '施設',
  building: '建物',
  street: '通り',
  suburb: '地区',
  district: '地区',
  city: '市区町村',
  county: '郡',
  state: '都道府県',
  postcode: '郵便番号',
  country: '国',
  unknown: '場所',
};

function kindLabel(resultType: string | undefined): string | null {
  if (!resultType) return null;
  return KIND_LABELS[resultType] ?? '場所';
}

function cap(value: string): string {
  return value.length > PLACE_ADDRESS_MAX_LENGTH ? value.slice(0, PLACE_ADDRESS_MAX_LENGTH) : value;
}

/** Map one validated Geoapify feature to a provider-agnostic GeoPlace. */
function toGeoPlace(feature: GeoapifyFeature, index: number): GeoPlace {
  const p = feature.properties;
  const name = p.name?.trim() || p.address_line1?.trim() || p.formatted?.trim() || '名称未設定';
  const address = p.formatted?.trim() ? cap(p.formatted.trim()) : null;
  // Prefer the vendor's stable id; otherwise compose a deterministic one so
  // React keys / selection stay stable across identical result sets.
  const id = p.place_id ?? `geo:${p.lon},${p.lat}:${index}`;
  return {
    id,
    name,
    address,
    latitude: p.lat,
    longitude: p.lon,
    kind: kindLabel(p.result_type),
    city: p.city?.trim() || null,
    prefecture: p.state?.trim() || null,
  };
}

// ---------------------------------------------------------------------------
// Timeout + caller-abort plumbing
// ---------------------------------------------------------------------------

interface LinkedSignal {
  signal: AbortSignal;
  cleanup: () => void;
  timedOut: () => boolean;
}

/**
 * Produce a signal that aborts when EITHER the caller aborts OR the timeout
 * fires, while remembering which happened (so the two can be reported as
 * distinct error kinds).
 */
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
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export interface GeoapifyProviderOptions {
  apiKey: string;
  /** Injectable fetch (defaults to global). */
  fetchImpl?: FetchLike;
  /** Per-request time budget in ms (8–10s by design). */
  timeoutMs?: number;
}

/**
 * Geoapify Geocoding API implementation. All URL construction lives in
 * `buildUrl`; the API key is appended there and never logged or placed into any
 * thrown error.
 */
export class GeoapifyGeocodingProvider implements GeocodingProvider {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: GeoapifyProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Build a fully-qualified request URL. The only place the key is attached. */
  private buildUrl(path: 'search' | 'reverse', params: Record<string, string>): string {
    const url = new URL(`${GEOAPIFY_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('format', 'geojson');
    url.searchParams.set('apiKey', this.apiKey);
    return url.toString();
  }

  private async request(url: string, signal: AbortSignal | undefined): Promise<unknown> {
    const linked = linkSignals(signal, this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { signal: linked.signal });
    } catch (error) {
      if (isAbortError(error)) {
        // Timeout fired vs. caller cancelled — reported distinctly.
        if (linked.timedOut()) throw new GeocodingError('timeout');
        throw new GeocodingError('aborted');
      }
      throw new GeocodingError('network', undefined, error);
    } finally {
      linked.cleanup();
    }

    if (!response.ok) {
      throw new GeocodingError(statusToErrorKind(response.status));
    }

    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new GeocodingError('invalid-response', undefined, error);
    }
  }

  async search(options: SearchPlacesOptions): Promise<GeoPlace[]> {
    const query = options.query.trim();
    const limit = options.limit ?? PLACE_SEARCH_RESULT_LIMIT;
    const params: Record<string, string> = {
      text: query,
      filter: `countrycode:${GEOCODING_COUNTRY_CODE}`,
      lang: GEOCODING_LANGUAGE,
      limit: String(limit),
    };
    // Bias affects ranking only; the country filter above is always kept.
    if (options.bias) {
      params.bias = `proximity:${options.bias.longitude},${options.bias.latitude}`;
    }

    const json = await this.request(this.buildUrl('search', params), options.signal);
    const parsed = featureCollectionSchema.safeParse(json);
    if (!parsed.success) throw new GeocodingError('invalid-response', undefined, parsed.error);
    return parsed.data.features.slice(0, limit).map(toGeoPlace);
  }

  async reverse(options: ReverseGeocodeOptions): Promise<ReverseGeocodeResult> {
    const params: Record<string, string> = {
      lat: String(options.latitude),
      lon: String(options.longitude),
      lang: GEOCODING_LANGUAGE,
      limit: '1',
    };
    const json = await this.request(this.buildUrl('reverse', params), options.signal);
    const parsed = featureCollectionSchema.safeParse(json);
    if (!parsed.success) throw new GeocodingError('invalid-response', undefined, parsed.error);
    const first = parsed.data.features[0];
    if (!first) return { name: null, address: null };
    const place = toGeoPlace(first, 0);
    return {
      // Only surface a name distinct from our own placeholder fallback.
      name: place.name === '名称未設定' ? null : place.name,
      address: place.address,
    };
  }
}
