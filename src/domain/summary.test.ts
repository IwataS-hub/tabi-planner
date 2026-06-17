import { describe, expect, it } from 'vitest';
import { summarizeDay } from './summary';
import type { Place } from './types';

function place(overrides: Partial<Place>): Place {
  return {
    id: 'p',
    tripId: 't',
    dayId: 'd',
    name: 'spot',
    category: 'sightseeing',
    latitude: 35,
    longitude: 135,
    startTime: null,
    stayMinutes: null,
    travelMinutes: null,
    memo: '',
    url: '',
    estimatedCost: null,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('summarizeDay', () => {
  it('sums stay, travel and cost and counts spots', () => {
    const summary = summarizeDay([
      place({ stayMinutes: 60, travelMinutes: 15, estimatedCost: 1200 }),
      place({ stayMinutes: 90, travelMinutes: 30, estimatedCost: 800 }),
    ]);
    expect(summary).toEqual({
      placeCount: 2,
      totalStayMinutes: 150,
      totalTravelMinutes: 45,
      totalCost: 2000,
    });
  });

  it('treats null fields as zero', () => {
    const summary = summarizeDay([place({}), place({ stayMinutes: 30 })]);
    expect(summary).toEqual({
      placeCount: 2,
      totalStayMinutes: 30,
      totalTravelMinutes: 0,
      totalCost: 0,
    });
  });

  it('returns all zeros for an empty day', () => {
    expect(summarizeDay([])).toEqual({
      placeCount: 0,
      totalStayMinutes: 0,
      totalTravelMinutes: 0,
      totalCost: 0,
    });
  });
});
