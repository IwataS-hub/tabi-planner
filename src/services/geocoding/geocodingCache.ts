/**
 * Tiny in-memory, time-bounded cache for geocoding results. Keeps external API
 * usage down by reusing identical lookups within a session. Nothing here is
 * persisted — the cache is cleared on reload, so no search data is stored on
 * disk.
 */

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlCacheOptions {
  /** Time-to-live per entry, in milliseconds. */
  ttlMs: number;
  /** Hard cap on entries; the oldest-used entry is evicted past this. */
  maxEntries: number;
  /** Injectable clock for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, Entry<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
    this.now = options.now ?? Date.now;
  }

  /** Return a live (non-expired) value, or undefined. Expired entries are dropped. */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh recency (Map preserves insertion order → re-insert to mark as MRU).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Default cache tuning for geocoding searches. */
export const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const SEARCH_CACHE_MAX_ENTRIES = 50;

/** Stable cache key from a query plus the conditions that change its results. */
export function searchCacheKey(input: {
  query: string;
  limit: number;
  bias?: { latitude: number; longitude: number } | null;
}): string {
  const query = input.query.trim().toLowerCase();
  // Round the bias so near-identical map centers share a cache entry.
  const bias = input.bias
    ? `${input.bias.latitude.toFixed(2)},${input.bias.longitude.toFixed(2)}`
    : 'none';
  return `${query}|${input.limit}|${bias}`;
}
