import { describe, expect, it, vi } from 'vitest';
import type { FetchLike } from './GeocodingProvider';
import { GeoapifyGeocodingProvider } from './GeoapifyGeocodingProvider';
import { GeocodingError } from './geocodingErrors';

const API_KEY = 'secret-test-key';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SEARCH_BODY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        place_id: 'abc123',
        name: '清水寺',
        formatted: '清水寺, 京都府京都市東山区清水1丁目294',
        address_line1: '清水寺',
        city: '京都市',
        state: '京都府',
        result_type: 'amenity',
        category: 'tourism.sights',
        country_code: 'jp',
        lat: 34.9948,
        lon: 135.785,
      },
    },
    {
      type: 'Feature',
      properties: {
        name: '京都駅',
        formatted: '京都駅, 京都府京都市下京区',
        city: '京都市',
        state: '京都府',
        result_type: 'amenity',
        lat: 34.9858,
        lon: 135.7588,
      },
    },
  ],
};

/** A fetch stub that records the URL it was called with. */
function recordingFetch(response: Response): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    calls.push(url);
    return Promise.resolve(response);
  };
  return { fetchImpl, calls };
}

/** A fetch that rejects only when its signal aborts (and checks up front). */
const abortAwareFetch: FetchLike = (_url, init) =>
  new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
  });

describe('GeoapifyGeocodingProvider.search', () => {
  it('maps a successful response into provider-agnostic GeoPlaces', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse(SEARCH_BODY));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });

    const results = await provider.search({ query: '清水寺' });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: 'abc123',
      name: '清水寺',
      address: '清水寺, 京都府京都市東山区清水1丁目294',
      latitude: 34.9948,
      longitude: 135.785,
      kind: '施設',
      city: '京都市',
      prefecture: '京都府',
    });
    // A feature without place_id still gets a stable, deterministic id.
    expect(results[1].id).toContain('geo:');
  });

  it('restricts to Japan and prefers Japanese, capped at the limit', async () => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(SEARCH_BODY));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });

    await provider.search({ query: '  京都  ', limit: 5 });

    const url = new URL(calls[0]);
    expect(url.searchParams.get('filter')).toBe('countrycode:jp');
    expect(url.searchParams.get('lang')).toBe('ja');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('text')).toBe('京都'); // trimmed
    expect(url.searchParams.get('format')).toBe('geojson');
  });

  it('adds a proximity bias when a center is given, keeping the country filter', async () => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(SEARCH_BODY));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });

    await provider.search({ query: '駅', bias: { latitude: 35.0, longitude: 135.7 } });

    const url = new URL(calls[0]);
    expect(url.searchParams.get('bias')).toBe('proximity:135.7,35');
    expect(url.searchParams.get('filter')).toBe('countrycode:jp');
  });

  it('caps results at the requested limit even if the API returns more', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse(SEARCH_BODY));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    const results = await provider.search({ query: '京都', limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('never exposes the API key in a thrown error', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({ error: 'unauthorized' }, 401));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });

    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({ kind: 'auth' });
    try {
      await provider.search({ query: '京都' });
    } catch (error) {
      const err = error as GeocodingError;
      expect(err.message).not.toContain(API_KEY);
      expect(String(err.stack)).not.toContain(API_KEY);
    }
  });

  it('does not log the API key', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchImpl } = recordingFetch(jsonResponse(SEARCH_BODY));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });

    await provider.search({ query: '京都' });

    for (const spy of [logSpy, errorSpy]) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(API_KEY);
      }
    }
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('rejects a structurally invalid response', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({ nope: true }));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejects a non-JSON response body', async () => {
    const fetchImpl: FetchLike = () =>
      Promise.resolve(new Response('<html>not json</html>', { status: 200 }));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejects a response with an out-of-range latitude', async () => {
    const bad = {
      features: [{ properties: { name: 'bad', lat: 999, lon: 135 } }],
    };
    const { fetchImpl } = recordingFetch(jsonResponse(bad));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejects a response with a non-finite coordinate', async () => {
    // JSON cannot carry Infinity; simulate a body that parses to it.
    const fetchImpl: FetchLike = () =>
      Promise.resolve(
        new Response('{"features":[{"properties":{"name":"x","lat":1e999,"lon":135}}]}', {
          status: 200,
        }),
      );
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate-limit'],
    [500, 'server'],
    [503, 'server'],
  ])('maps HTTP %i to error kind %s', async (status, kind) => {
    const { fetchImpl } = recordingFetch(jsonResponse({ error: true }, status));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({ kind });
  });

  it('reports a connection failure as a network error', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({ kind: 'network' });
  });

  it('reports a timeout when the request exceeds the budget', async () => {
    const provider = new GeoapifyGeocodingProvider({
      apiKey: API_KEY,
      fetchImpl: abortAwareFetch,
      timeoutMs: 10,
    });
    await expect(provider.search({ query: '京都' })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('reports an aborted request when the caller cancels', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new GeoapifyGeocodingProvider({
      apiKey: API_KEY,
      fetchImpl: abortAwareFetch,
      timeoutMs: 9000,
    });
    await expect(
      provider.search({ query: '京都', signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });
});

describe('GeoapifyGeocodingProvider.reverse', () => {
  it('returns a name and address for a coordinate', async () => {
    const body = {
      features: [
        {
          properties: {
            name: '東京タワー',
            formatted: '東京タワー, 東京都港区芝公園4丁目2-8',
            city: '港区',
            state: '東京都',
            result_type: 'amenity',
            lat: 35.6586,
            lon: 139.7454,
          },
        },
      ],
    };
    const { fetchImpl, calls } = recordingFetch(jsonResponse(body));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });

    const result = await provider.reverse({ latitude: 35.6586, longitude: 139.7454 });
    expect(result).toEqual({
      name: '東京タワー',
      address: '東京タワー, 東京都港区芝公園4丁目2-8',
    });
    const url = new URL(calls[0]);
    expect(url.searchParams.get('lat')).toBe('35.6586');
    expect(url.searchParams.get('lon')).toBe('139.7454');
    expect(url.searchParams.get('lang')).toBe('ja');
  });

  it('returns nulls when there are no features', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({ features: [] }));
    const provider = new GeoapifyGeocodingProvider({ apiKey: API_KEY, fetchImpl });
    const result = await provider.reverse({ latitude: 0, longitude: 0 });
    expect(result).toEqual({ name: null, address: null });
  });
});
