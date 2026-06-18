import type { TripWeather } from '@/domain/weather';
import { isDateInForecastRange } from '@/domain/weather';
import type { LatLng, Place, TripDay } from '@/domain/types';
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider';
import type { WeatherProvider } from './WeatherProvider';
import {
  getCachedWeather,
  getInFlight,
  setCachedWeather,
  setInFlight,
  weatherCacheKey,
} from './weatherCache';
import { WeatherError } from './weatherErrors';

let _provider: WeatherProvider | null = null;

export function getWeatherProvider(): WeatherProvider {
  if (!_provider) _provider = new OpenMeteoWeatherProvider();
  return _provider;
}

/** Replace provider (for testing). */
export function setWeatherProvider(provider: WeatherProvider | null): void {
  _provider = provider;
}

/**
 * Find the representative coordinate for weather:
 * 1. First place of the given day
 * 2. Otherwise first available place in the trip
 * 3. null if no places exist
 */
export function representativeCoordinate(
  days: TripDay[],
  placesByDay: Record<string, Place[]>,
  preferDayId?: string,
): LatLng | null {
  // Try the preferred day first
  if (preferDayId) {
    const dayPlaces = placesByDay[preferDayId];
    if (dayPlaces && dayPlaces.length > 0) {
      const first = dayPlaces[0];
      return { latitude: first.latitude, longitude: first.longitude };
    }
  }
  // Fall back to first place in trip (ordered by day order)
  const sortedDays = [...days].sort((a, b) => a.order - b.order);
  for (const day of sortedDays) {
    const dayPlaces = placesByDay[day.id];
    if (dayPlaces && dayPlaces.length > 0) {
      const first = dayPlaces[0];
      return { latitude: first.latitude, longitude: first.longitude };
    }
  }
  return null;
}

/**
 * Fetch weather for a trip's date range, using cache and in-flight sharing.
 * Returns null when the date range is entirely out of the forecast window or
 * when no coordinate is available.
 *
 * Never substitutes a cached result from a past request if the current request
 * targets out-of-range dates.
 */
export async function fetchTripWeather(
  coordinate: LatLng,
  startDate: string,
  endDate: string,
  today: string,
  signal?: AbortSignal,
): Promise<TripWeather | null> {
  // Check that at least some dates are in forecast range
  if (!isDateInForecastRange(startDate, today) && !isDateInForecastRange(endDate, today)) {
    throw new WeatherError(
      'out-of-range',
      '旅行日程が天気予報の範囲外です（現在から16日以内の日程のみ対応）',
    );
  }

  // Clamp to forecast range
  const clampedStart = startDate < today ? today : startDate;
  const key = weatherCacheKey(coordinate.latitude, coordinate.longitude, clampedStart, endDate);

  const cached = getCachedWeather(key);
  if (cached) return cached;

  const inflight = getInFlight(key);
  if (inflight) return inflight;

  const provider = getWeatherProvider();
  const promise = provider
    .fetchWeather({ coordinate, startDate: clampedStart, endDate, signal })
    .then((weather) => {
      setCachedWeather(key, weather);
      return weather;
    });

  setInFlight(key, promise);
  return promise;
}

export { WeatherError };
