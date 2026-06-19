import { describe, expect, it } from 'vitest';
import { computeWarnings, type WarningContext } from './itineraryWarnings';
import type { Place, TripDay } from './types';

function makeDay(id: string, date: string, order: number): TripDay {
  return { id, tripId: 'trip1', date, order };
}

function makePlace(dayId: string, overrides: Partial<Place> = {}): Place {
  return {
    id: `place-${Math.random()}`,
    tripId: 'trip1',
    dayId,
    name: 'Test',
    category: 'sightseeing',
    latitude: 35,
    longitude: 135,
    address: null,
    startTime: null,
    stayMinutes: 60,
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

function makeCtx(overrides: Partial<WarningContext> = {}): WarningContext {
  return {
    trip: { budgetYen: null },
    days: [],
    placesByDay: {},
    timelineByDay: {},
    reservations: [],
    candidatePlaces: [],
    totalSpentYen: null,
    ...overrides,
  };
}

describe('computeWarnings', () => {
  it('returns no warnings for empty trip', () => {
    expect(computeWarnings(makeCtx())).toEqual([]);
  });

  it('warns when candidate places are unscheduled', () => {
    const ctx = makeCtx({
      candidatePlaces: [
        {
          id: 'c1',
          tripId: 'trip1',
          name: 'X',
          category: 'food',
          latitude: 35,
          longitude: 135,
          address: null,
          startTime: null,
          stayMinutes: null,
          memo: '',
          url: '',
          estimatedCost: null,
          visitStatus: 'planned',
          order: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const warnings = computeWarnings(ctx);
    expect(warnings.some((w) => w.message.includes('候補スポット'))).toBe(true);
    expect(warnings.find((w) => w.message.includes('候補'))?.dayId).toBeNull();
  });

  it('warns about budget overrun', () => {
    const ctx = makeCtx({ trip: { budgetYen: 10000 }, totalSpentYen: 15000 });
    const warnings = computeWarnings(ctx);
    expect(warnings.some((w) => w.message.includes('超過'))).toBe(true);
    expect(warnings.find((w) => w.message.includes('超過'))?.level).toBe('warning');
  });

  it('no budget warning when no budget set', () => {
    const ctx = makeCtx({ totalSpentYen: 15000 });
    expect(computeWarnings(ctx).some((w) => w.message.includes('超過'))).toBe(false);
  });

  it('warns about missing travel time', () => {
    const day = makeDay('d1', '2026-06-01', 0);
    const p1 = makePlace('d1', { travelMinutes: null });
    const p2 = makePlace('d1');
    const ctx = makeCtx({
      days: [day],
      placesByDay: { d1: [p1, p2] },
      timelineByDay: { d1: [] },
    });
    expect(computeWarnings(ctx).some((w) => w.message.includes('移動時間'))).toBe(true);
  });

  it('warns when day is too packed (>10h)', () => {
    const day = makeDay('d1', '2026-06-01', 0);
    // 5 places × 120 min + 1 travel × 10 = 610 > 600
    const places = Array.from({ length: 5 }, (_, i) =>
      makePlace('d1', { id: `p${i}`, stayMinutes: 120, travelMinutes: 10 }),
    );
    const ctx = makeCtx({
      days: [day],
      placesByDay: { d1: places },
      timelineByDay: { d1: [] },
    });
    expect(computeWarnings(ctx).some((w) => w.message.includes('詰まりすぎ'))).toBe(true);
  });

  it('warns about rainy outdoor places when weather code set', () => {
    const day = makeDay('d1', '2026-06-01', 0);
    const p = makePlace('d1', { category: 'sightseeing' });
    const ctx = makeCtx({
      days: [day],
      placesByDay: { d1: [p] },
      timelineByDay: { d1: [] },
      weatherCodeByDate: { '2026-06-01': 61 }, // rain
    });
    expect(computeWarnings(ctx).some((w) => w.message.includes('雨'))).toBe(true);
  });

  it('no rain warning when weather code not set', () => {
    const day = makeDay('d1', '2026-06-01', 0);
    const p = makePlace('d1', { category: 'sightseeing' });
    const ctx = makeCtx({
      days: [day],
      placesByDay: { d1: [p] },
      timelineByDay: { d1: [] },
    });
    expect(computeWarnings(ctx).some((w) => w.message.includes('雨'))).toBe(false);
  });

  it('warns about missing lodging for non-last days', () => {
    const day1 = makeDay('d1', '2026-06-01', 0);
    const day2 = makeDay('d2', '2026-06-02', 1);
    const ctx = makeCtx({
      days: [day1, day2],
      placesByDay: { d1: [], d2: [] },
      timelineByDay: { d1: [], d2: [] },
    });
    const warnings = computeWarnings(ctx);
    // day1 should warn (not last), day2 should not (last)
    expect(warnings.some((w) => w.dayId === 'd1' && w.message.includes('宿泊'))).toBe(true);
    expect(warnings.some((w) => w.dayId === 'd2' && w.message.includes('宿泊'))).toBe(false);
  });

  it('no lodging warning when reservation exists', () => {
    const day = makeDay('d1', '2026-06-01', 0);
    const day2 = makeDay('d2', '2026-06-02', 1);
    const ctx = makeCtx({
      days: [day, day2],
      placesByDay: { d1: [], d2: [] },
      timelineByDay: { d1: [], d2: [] },
      reservations: [
        {
          id: 'r1',
          tripId: 'trip1',
          dayId: 'd1',
          placeId: null,
          kind: 'lodging',
          title: 'Hotel',
          startAt: null,
          endAt: null,
          location: '',
          confirmationCode: '',
          url: '',
          phone: '',
          memo: '',
          isPrivate: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(computeWarnings(ctx).some((w) => w.dayId === 'd1' && w.message.includes('宿泊'))).toBe(
      false,
    );
  });
});
