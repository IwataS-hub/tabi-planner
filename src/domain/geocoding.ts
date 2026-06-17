/**
 * Provider-agnostic geocoding domain types. UI and repository code depend ONLY
 * on these shapes — never on a vendor's raw response. Swapping providers means
 * implementing `GeocodingProvider` (see `services/geocoding`) against these
 * types; nothing in the UI changes.
 */

/**
 * A geographic search hit, already cleaned up for display and persistence.
 * Only the fields the product needs are kept — vendor-specific extras are not
 * carried around or persisted.
 */
export interface GeoPlace {
  /** Stable id for React keys / selection within a result set. */
  id: string;
  /** Place / facility name (e.g. "清水寺"). Always non-empty. */
  name: string;
  /** Full formatted address, or null when the provider gave none. */
  address: string | null;
  latitude: number;
  longitude: number;
  /** Human-readable kind label (e.g. "観光地", "住所"), or null. */
  kind: string | null;
  /** City / ward, when available. */
  city: string | null;
  /** Prefecture / state, when available. */
  prefecture: string | null;
}

/** Result of reverse geocoding a coordinate. Both fields may be null. */
export interface ReverseGeocodeResult {
  name: string | null;
  address: string | null;
}

/** A coordinate used as a (ranking-only) search bias. */
export interface BiasCenter {
  latitude: number;
  longitude: number;
}

export interface SearchPlacesOptions {
  /** Raw user query; the provider trims and validates it. */
  query: string;
  /** Hard cap on results. Defaults to {@link PLACE_SEARCH_RESULT_LIMIT}. */
  limit?: number;
  /** Optional map-center bias (affects ranking only, never the country filter). */
  bias?: BiasCenter | null;
  /** Abort signal to cancel an in-flight request. */
  signal?: AbortSignal;
}

export interface ReverseGeocodeOptions {
  latitude: number;
  longitude: number;
  signal?: AbortSignal;
}

/** Minimum query length before a search request is issued. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Maximum number of results requested/shown. */
export const PLACE_SEARCH_RESULT_LIMIT = 5;

/** Search/reverse requests are restricted to Japan. */
export const GEOCODING_COUNTRY_CODE = 'jp';

/** Preferred language for results. */
export const GEOCODING_LANGUAGE = 'ja';
