import type { LatLng, Place } from './types';

/**
 * Provider-agnostic routing domain. UI and repository code depend ONLY on these
 * types — never on a vendor's raw response. The mapping to Geoapify's `mode`
 * value lives in {@link geoapifyRoutingMode} (one place) so a provider swap or a
 * mode-name change touches a single function.
 */

export const TRAVEL_MODES = ['walk', 'drive', 'bicycle', 'transit'] as const;
export type TravelMode = (typeof TRAVEL_MODES)[number];

export const TRAVEL_MODE_LABELS: Record<TravelMode, string> = {
  walk: '徒歩',
  drive: '自動車',
  bicycle: '自転車',
  transit: '公共交通',
};

export const TRAVEL_MODE_OPTION_LABELS: Record<TravelMode, string> = {
  ...TRAVEL_MODE_LABELS,
  transit: '公共交通（参考）',
};

export const DEFAULT_TRAVEL_MODE: TravelMode = 'walk';

/** Modes whose estimate is only a rough reference (shown as「参考」). */
export function isReferenceMode(mode: TravelMode): boolean {
  return mode === 'transit';
}

export function isTravelMode(value: unknown): value is TravelMode {
  return typeof value === 'string' && (TRAVEL_MODES as readonly string[]).includes(value);
}

/** Map our travel mode to Geoapify's routing `mode`. The ONLY such mapping. */
export function geoapifyRoutingMode(mode: TravelMode): string {
  switch (mode) {
    case 'walk':
      return 'walk';
    case 'drive':
      return 'drive';
    case 'bicycle':
      return 'bicycle';
    case 'transit':
      return 'approximated_transit';
  }
}

/** How a leg's `travelMinutes` was produced. */
export type TravelEstimateSource = 'auto' | 'manual';

/** A computed route between two points (kept in memory only; never persisted). */
export interface RouteEstimate {
  /** Travel time in seconds (finite, ≥ 0). */
  timeSeconds: number;
  /** Distance in meters (finite, ≥ 0). */
  distanceMeters: number;
  /** Road/path-following shape as ordered coordinates. */
  geometry: LatLng[];
}

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  mode: TravelMode;
  signal?: AbortSignal;
}

/** Convert seconds to whole minutes, rounding up so a short leg is never 0. */
export function secondsToTravelMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

const COORD_KEY_PRECISION = 5;

function roundCoord(value: number): string {
  const normalised = Object.is(value, -0) ? 0 : value;
  return normalised.toFixed(COORD_KEY_PRECISION);
}

function assertFiniteCoordinate(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} is outside the valid coordinate range`);
  }
}

/**
 * Stable identity for a leg's route: rounded from/to coordinates plus mode.
 * Used as the in-memory cache key, the persisted `travelRouteKey`, and to detect
 * stale estimates. It NEVER contains the API key or a request URL.
 */
export function routeKey(from: LatLng, to: LatLng, mode: TravelMode): string {
  assertFiniteCoordinate(from.latitude, 'from.latitude', -90, 90);
  assertFiniteCoordinate(from.longitude, 'from.longitude', -180, 180);
  assertFiniteCoordinate(to.latitude, 'to.latitude', -90, 90);
  assertFiniteCoordinate(to.longitude, 'to.longitude', -180, 180);
  return [
    roundCoord(from.latitude),
    roundCoord(from.longitude),
    roundCoord(to.latitude),
    roundCoord(to.longitude),
    mode,
  ].join(',');
}

/** Human-readable distance: metres below 1 km, otherwise km with one decimal. */
export function formatDistanceMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * True when a saved AUTO estimate no longer matches the current segment (the
 * next place changed, or the coordinates/mode changed). Pure and UI-agnostic.
 * Manual times are never "stale".
 */
export function isAutoEstimateStale(fromPlace: Place, toPlace: Place): boolean {
  if (fromPlace.travelEstimateSource !== 'auto' || fromPlace.travelMode == null) return false;
  if (fromPlace.travelToPlaceId !== toPlace.id) return true;
  return (
    fromPlace.travelRouteKey !==
    routeKey(
      { latitude: fromPlace.latitude, longitude: fromPlace.longitude },
      { latitude: toPlace.latitude, longitude: toPlace.longitude },
      fromPlace.travelMode,
    )
  );
}
