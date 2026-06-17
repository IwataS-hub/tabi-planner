import type {
  GeoPlace,
  ReverseGeocodeOptions,
  ReverseGeocodeResult,
  SearchPlacesOptions,
} from '@/domain/geocoding';

/**
 * The seam between the app and any geocoding vendor. The UI talks to this
 * interface only; `GeoapifyGeocodingProvider` is one implementation and can be
 * replaced without touching callers. The caching layer also implements it so it
 * can be dropped in transparently.
 */
export interface GeocodingProvider {
  /** Forward geocoding: free-text query → ranked Japanese place hits. */
  search(options: SearchPlacesOptions): Promise<GeoPlace[]>;
  /** Reverse geocoding: coordinate → best-guess name + formatted address. */
  reverse(options: ReverseGeocodeOptions): Promise<ReverseGeocodeResult>;
}

/** Injectable `fetch` so providers can be unit-tested without the network. */
export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;
