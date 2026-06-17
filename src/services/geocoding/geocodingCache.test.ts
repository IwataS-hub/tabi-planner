import { describe, expect, it } from 'vitest';
import { TtlCache, searchCacheKey } from './geocodingCache';

describe('TtlCache', () => {
  it('returns a stored value before it expires (cache hit)', () => {
    let now = 1000;
    const cache = new TtlCache<string>({ ttlMs: 100, maxEntries: 10, now: () => now });
    cache.set('a', 'value');
    now = 1050;
    expect(cache.get('a')).toBe('value');
  });

  it('drops a value once it expires (cache miss)', () => {
    let now = 1000;
    const cache = new TtlCache<string>({ ttlMs: 100, maxEntries: 10, now: () => now });
    cache.set('a', 'value');
    now = 1101; // past ttl
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('evicts the least-recently-used entry past the max', () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2, now: () => 0 });
    cache.set('a', 1);
    cache.set('b', 2);
    // Touch 'a' so 'b' becomes least-recently-used.
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });
});

describe('searchCacheKey', () => {
  it('is identical for the same query/limit ignoring case and surrounding space', () => {
    const a = searchCacheKey({ query: '  Kyoto ', limit: 5 });
    const b = searchCacheKey({ query: 'kyoto', limit: 5 });
    expect(a).toBe(b);
  });

  it('differs when the limit differs', () => {
    expect(searchCacheKey({ query: 'kyoto', limit: 5 })).not.toBe(
      searchCacheKey({ query: 'kyoto', limit: 3 }),
    );
  });

  it('shares a key for near-identical bias centers but differs for distant ones', () => {
    const near1 = searchCacheKey({
      query: 'x',
      limit: 5,
      bias: { latitude: 35.001, longitude: 135.001 },
    });
    const near2 = searchCacheKey({
      query: 'x',
      limit: 5,
      bias: { latitude: 35.004, longitude: 135.002 },
    });
    const far = searchCacheKey({
      query: 'x',
      limit: 5,
      bias: { latitude: 43.0, longitude: 141.0 },
    });
    expect(near1).toBe(near2);
    expect(near1).not.toBe(far);
  });
});
