import { describe, expect, it } from 'vitest';
import { computeTimeline } from './timeline';
import type { Place } from './types';

function makePlace(overrides: Partial<Place> & { id: string }): Place {
  return {
    tripId: 'trip1',
    dayId: 'day1',
    name: 'Test',
    category: 'sightseeing',
    latitude: 35,
    longitude: 135,
    address: null,
    startTime: null,
    stayMinutes: null,
    travelMinutes: null,
    memo: '',
    url: '',
    estimatedCost: null,
    visitStatus: 'planned',
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    travelToPlaceId: null,
    travelRouteKey: null,
    travelCalculatedAt: null,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeTimeline', () => {
  it('returns empty for empty places', () => {
    expect(computeTimeline([])).toEqual([]);
  });

  it('returns null times when no startTime is set', () => {
    const places = [makePlace({ id: 'a' }), makePlace({ id: 'b' })];
    const result = computeTimeline(places);
    expect(result).toHaveLength(2);
    expect(result[0].arrivalTime).toBeNull();
    expect(result[1].arrivalTime).toBeNull();
  });

  it('sets anchor arrival from startTime', () => {
    const places = [
      makePlace({ id: 'a', startTime: '10:00', stayMinutes: 60 }),
      makePlace({ id: 'b' }),
    ];
    const result = computeTimeline(places);
    expect(result[0].arrivalTime).toBe('10:00');
    expect(result[0].isEstimated).toBe(false);
    expect(result[0].departureTime).toBe('11:00');
  });

  it('propagates forward when travel time is set', () => {
    const places = [
      makePlace({ id: 'a', startTime: '09:00', stayMinutes: 60, travelMinutes: 30 }),
      makePlace({ id: 'b', stayMinutes: 90 }),
      makePlace({ id: 'c' }),
    ];
    const result = computeTimeline(places);
    // a departs 10:00, travel 30m → b arrives 10:30
    expect(result[1].arrivalTime).toBe('10:30');
    expect(result[1].isEstimated).toBe(true);
    expect(result[1].departureTime).toBe('12:00');
    // b departs 12:00, but no travel time → can't estimate c
    expect(result[2].arrivalTime).toBeNull();
  });

  it('stops propagation when travel time is missing', () => {
    const places = [
      makePlace({ id: 'a', startTime: '08:00', stayMinutes: 30 }),
      // no travelMinutes
      makePlace({ id: 'b', stayMinutes: 60 }),
      makePlace({ id: 'c' }),
    ];
    const result = computeTimeline(places);
    expect(result[0].arrivalTime).toBe('08:00');
    expect(result[1].arrivalTime).toBeNull();
    expect(result[2].arrivalTime).toBeNull();
  });

  it('handles multiple anchors', () => {
    const places = [
      makePlace({ id: 'a', startTime: '09:00', stayMinutes: 60, travelMinutes: 30 }),
      makePlace({ id: 'b', stayMinutes: 60, travelMinutes: 20 }),
      makePlace({ id: 'c', startTime: '14:00', stayMinutes: 60 }),
    ];
    const result = computeTimeline(places);
    // a → b propagated
    expect(result[1].arrivalTime).toBe('10:30');
    // c is an explicit anchor
    expect(result[2].arrivalTime).toBe('14:00');
    expect(result[2].isEstimated).toBe(false);
  });

  it('departure = arrival + stayMinutes', () => {
    const places = [makePlace({ id: 'a', startTime: '13:30', stayMinutes: 45 })];
    const result = computeTimeline(places);
    expect(result[0].departureTime).toBe('14:15');
  });

  it('departure is null when stayMinutes is null', () => {
    const places = [makePlace({ id: 'a', startTime: '10:00' })];
    const result = computeTimeline(places);
    expect(result[0].departureTime).toBeNull();
  });
});
