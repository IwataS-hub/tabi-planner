import { describe, expect, it } from 'vitest';
import type { RouteEstimate, RouteRequest } from '@/domain/routing';
import { TtlCache } from '@/services/geocoding/geocodingCache';
import type { RoutingProvider } from './RoutingProvider';
import { CachingRoutingService } from './routingService';

const FROM = { latitude: 35.0, longitude: 135.0 };
const TO = { latitude: 35.1, longitude: 135.1 };

function estimate(): RouteEstimate {
  return { timeSeconds: 600, distanceMeters: 800, geometry: [FROM, TO] };
}

class CountingProvider implements RoutingProvider {
  calls = 0;
  route(_request: RouteRequest): Promise<RouteEstimate> {
    this.calls += 1;
    return Promise.resolve(estimate());
  }
}

describe('CachingRoutingService', () => {
  it('serves an identical leg+mode from cache (cache hit)', async () => {
    const provider = new CountingProvider();
    const service = new CachingRoutingService(provider);
    const first = await service.route({ from: FROM, to: TO, mode: 'walk' });
    const second = await service.route({ from: FROM, to: TO, mode: 'walk' });
    expect(provider.calls).toBe(1);
    expect(second).toEqual(first);
  });

  it('re-requests a different mode for the same leg', async () => {
    const provider = new CountingProvider();
    const service = new CachingRoutingService(provider);
    await service.route({ from: FROM, to: TO, mode: 'walk' });
    await service.route({ from: FROM, to: TO, mode: 'drive' });
    expect(provider.calls).toBe(2);
  });

  it('re-requests once the cache entry expires', async () => {
    let now = 0;
    const cache = new TtlCache<RouteEstimate>({ ttlMs: 100, maxEntries: 10, now: () => now });
    const provider = new CountingProvider();
    const service = new CachingRoutingService(provider, cache);
    await service.route({ from: FROM, to: TO, mode: 'walk' });
    now = 250;
    await service.route({ from: FROM, to: TO, mode: 'walk' });
    expect(provider.calls).toBe(2);
  });

  it('evicts the least-recently-used entry past the cap', async () => {
    const cache = new TtlCache<RouteEstimate>({ ttlMs: 10_000, maxEntries: 1, now: () => 0 });
    const provider = new CountingProvider();
    const service = new CachingRoutingService(provider, cache);
    await service.route({ from: FROM, to: TO, mode: 'walk' });
    await service.route({ from: FROM, to: TO, mode: 'drive' }); // evicts the walk entry
    await service.route({ from: FROM, to: TO, mode: 'walk' }); // miss again
    expect(provider.calls).toBe(3);
    expect(cache.size).toBe(1);
  });
});
