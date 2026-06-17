import { describe, expect, it } from 'vitest';
import type { GeoPlace, SearchPlacesOptions } from '@/domain/geocoding';
import type { GeocodingProvider } from './GeocodingProvider';
import { CachingGeocodingService } from './geocodingService';
import { TtlCache } from './geocodingCache';

function place(id: string): GeoPlace {
  return {
    id,
    name: id,
    address: null,
    latitude: 35,
    longitude: 135,
    kind: null,
    city: null,
    prefecture: null,
  };
}

class CountingProvider implements GeocodingProvider {
  searchCalls = 0;
  lastOptions: SearchPlacesOptions | null = null;

  search(options: SearchPlacesOptions): Promise<GeoPlace[]> {
    this.searchCalls += 1;
    this.lastOptions = options;
    return Promise.resolve([place(options.query)]);
  }

  reverse() {
    return Promise.resolve({ name: null, address: null });
  }
}

describe('CachingGeocodingService', () => {
  it('serves an identical query from cache without re-calling the provider', async () => {
    const provider = new CountingProvider();
    const service = new CachingGeocodingService(provider);

    const first = await service.search({ query: '京都' });
    const second = await service.search({ query: '京都' });

    expect(provider.searchCalls).toBe(1);
    expect(second).toEqual(first);
  });

  it('re-queries once the cache entry has expired', async () => {
    let now = 0;
    const cache = new TtlCache<GeoPlace[]>({ ttlMs: 100, maxEntries: 10, now: () => now });
    const provider = new CountingProvider();
    const service = new CachingGeocodingService(provider, cache);

    await service.search({ query: '京都' });
    now = 250; // past the TTL
    await service.search({ query: '京都' });

    expect(provider.searchCalls).toBe(2);
  });

  it('does not share cache entries across different queries', async () => {
    const provider = new CountingProvider();
    const service = new CachingGeocodingService(provider);

    await service.search({ query: '京都' });
    await service.search({ query: '大阪' });

    expect(provider.searchCalls).toBe(2);
  });

  it('does not cache reverse geocoding', async () => {
    const provider = new CountingProvider();
    const service = new CachingGeocodingService(provider);
    const result = await service.reverse({ latitude: 35, longitude: 135 });
    expect(result).toEqual({ name: null, address: null });
  });
});
