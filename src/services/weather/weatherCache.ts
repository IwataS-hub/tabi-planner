import type { TripWeather } from '@/domain/weather';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 10;

interface CacheEntry {
  value: TripWeather;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<TripWeather>>();

export function weatherCacheKey(lat: number, lon: number, startDate: string, endDate: string): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)},${startDate},${endDate}`;
}

export function getCachedWeather(key: string): TripWeather | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedWeather(key: string, value: TripWeather): void {
  if (cache.size >= MAX_ENTRIES) {
    // Evict oldest entry
    const oldest = [...cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function getInFlight(key: string): Promise<TripWeather> | undefined {
  return inFlight.get(key);
}

export function setInFlight(key: string, promise: Promise<TripWeather>): void {
  inFlight.set(key, promise);
  void promise.finally(() => inFlight.delete(key));
}

/** Clear all cache entries (for testing). */
export function clearWeatherCache(): void {
  cache.clear();
  inFlight.clear();
}
