import type { LatLng } from '@/domain/types';

/**
 * Single source of truth for the Google Maps public-transit directions URL.
 *
 * Uses the official Maps URLs API (https://developers.google.com/maps/documentation/urls/get-started).
 * No API key is required or included. Returns `null` when either coordinate is
 * invalid so callers never render a broken link.
 */

const MAPS_DIRECTIONS_BASE = 'https://www.google.com/maps/dir/';

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Build a Google Maps directions URL for public transit between two points.
 * `travelmode=transit`. The result is well under the ~2,048 char URL limit and
 * contains no API key or Geoapify reference.
 */
export function buildTransitDirectionsUrl(from: LatLng, to: LatLng): string | null {
  if (!isValidCoordinate(from.latitude, from.longitude)) return null;
  if (!isValidCoordinate(to.latitude, to.longitude)) return null;

  const params = new URLSearchParams({
    api: '1',
    origin: `${from.latitude},${from.longitude}`,
    destination: `${to.latitude},${to.longitude}`,
    travelmode: 'transit',
  });
  return `${MAPS_DIRECTIONS_BASE}?${params.toString()}`;
}
