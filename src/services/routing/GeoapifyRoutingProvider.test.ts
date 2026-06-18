import { describe, expect, it, vi } from 'vitest';
import type { TravelMode } from '@/domain/routing';
import type { FetchLike } from './RoutingProvider';
import { GeoapifyRoutingProvider } from './GeoapifyRoutingProvider';
import { RoutingError } from './routingErrors';

const API_KEY = 'secret-routing-key';

const FROM = { latitude: 34.9948, longitude: 135.785 };
const TO = { latitude: 34.9858, longitude: 135.7588 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ROUTE_BODY = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { mode: 'walk', distance: 1300, time: 1080 },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [135.785, 34.9948],
            [135.7855, 34.992],
            [135.7588, 34.9858],
          ],
        ],
      },
    },
  ],
};

function recordingFetch(response: Response): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = (url) => {
    calls.push(url);
    return Promise.resolve(response);
  };
  return { fetchImpl, calls };
}

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

describe('GeoapifyRoutingProvider.route', () => {
  it('maps time, distance and geometry from a successful response', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse(ROUTE_BODY));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });

    const result = await provider.route({ from: FROM, to: TO, mode: 'walk' });

    expect(result.timeSeconds).toBe(1080);
    expect(result.distanceMeters).toBe(1300);
    // [lon, lat] flattened to {latitude, longitude}.
    expect(result.geometry).toHaveLength(3);
    expect(result.geometry[0]).toEqual({ latitude: 34.9948, longitude: 135.785 });
    expect(result.geometry[2]).toEqual({ latitude: 34.9858, longitude: 135.7588 });
  });

  it('supports a LineString geometry', async () => {
    const body = {
      features: [
        {
          properties: { distance: 100, time: 60 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [135.0, 35.0],
              [135.1, 35.1],
            ],
          },
        },
      ],
    };
    const { fetchImpl } = recordingFetch(jsonResponse(body));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    const result = await provider.route({ from: FROM, to: TO, mode: 'drive' });
    expect(result.geometry).toHaveLength(2);
  });

  it.each<[TravelMode, string]>([
    ['walk', 'walk'],
    ['drive', 'drive'],
    ['bicycle', 'bicycle'],
    ['transit', 'transit'],
  ])('sends Geoapify mode %s and lang=ja, with exactly two waypoints', async (mode, expected) => {
    const { fetchImpl, calls } = recordingFetch(jsonResponse(ROUTE_BODY));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });

    await provider.route({ from: FROM, to: TO, mode });

    const url = new URL(calls[0]);
    expect(url.searchParams.get('mode')).toBe(expected);
    expect(url.searchParams.get('lang')).toBe('ja');
    expect(url.searchParams.get('units')).toBe('metric');
    const waypoints = url.searchParams.get('waypoints') ?? '';
    expect(waypoints).toBe('34.9948,135.785|34.9858,135.7588');
    expect(waypoints.split('|')).toHaveLength(2);
    // We must not request advanced details, elevation, avoid, or optimization.
    expect(url.searchParams.get('details')).toBeNull();
    expect(url.searchParams.get('avoid')).toBeNull();
  });

  it('never exposes the API key in a thrown error', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({}, 401));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    try {
      await provider.route({ from: FROM, to: TO, mode: 'walk' });
      throw new Error('should have thrown');
    } catch (error) {
      const err = error as RoutingError;
      expect(err).toBeInstanceOf(RoutingError);
      expect(err.message).not.toContain(API_KEY);
      expect(String(err.stack)).not.toContain(API_KEY);
    }
  });

  it('does not log the API key', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchImpl } = recordingFetch(jsonResponse(ROUTE_BODY));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await provider.route({ from: FROM, to: TO, mode: 'walk' });
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
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejects a non-JSON body', async () => {
    const fetchImpl: FetchLike = () => Promise.resolve(new Response('<html>', { status: 200 }));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('reports no-route for an empty feature list', async () => {
    const { fetchImpl } = recordingFetch(jsonResponse({ features: [] }));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'no-route',
    });
  });

  it('rejects empty route geometry', async () => {
    const body = {
      features: [
        {
          properties: { distance: 100, time: 60 },
          geometry: { type: 'MultiLineString', coordinates: [[]] },
        },
      ],
    };
    const { fetchImpl } = recordingFetch(jsonResponse(body));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejects geometry with out-of-range coordinates', async () => {
    const body = {
      features: [
        {
          properties: { distance: 100, time: 60 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [135, 35],
              [200, 999],
            ],
          },
        },
      ],
    };
    const { fetchImpl } = recordingFetch(jsonResponse(body));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('rejects a negative time/distance', async () => {
    const body = {
      features: [
        {
          properties: { distance: -1, time: 60 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [135, 35],
              [135.1, 35.1],
            ],
          },
        },
      ],
    };
    const { fetchImpl } = recordingFetch(jsonResponse(body));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
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
    const { fetchImpl } = recordingFetch(jsonResponse({}, status));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind,
    });
  });

  it('reports a network error', async () => {
    const fetchImpl: FetchLike = () => Promise.reject(new TypeError('Failed to fetch'));
    const provider = new GeoapifyRoutingProvider({ apiKey: API_KEY, fetchImpl });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('reports a timeout', async () => {
    const provider = new GeoapifyRoutingProvider({
      apiKey: API_KEY,
      fetchImpl: abortAwareFetch,
      timeoutMs: 10,
    });
    await expect(provider.route({ from: FROM, to: TO, mode: 'walk' })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('reports an aborted request when the caller cancels', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new GeoapifyRoutingProvider({
      apiKey: API_KEY,
      fetchImpl: abortAwareFetch,
      timeoutMs: 9000,
    });
    await expect(
      provider.route({ from: FROM, to: TO, mode: 'walk', signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'aborted' });
  });
});
