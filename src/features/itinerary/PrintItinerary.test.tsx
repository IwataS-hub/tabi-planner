import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Place, Trip, TripDay } from '@/domain/types';
import { PrintItinerary } from './PrintItinerary';

const ISO = '2026-06-16T00:00:00.000Z';

const trip: Trip = {
  id: 't1',
  title: '京都旅行',
  description: '',
  startDate: '2026-07-01',
  endDate: '2026-07-01',
  budgetYen: null,
  createdAt: ISO,
  updatedAt: ISO,
  schemaVersion: 1,
};

const days: TripDay[] = [{ id: 'd1', tripId: 't1', date: '2026-07-01', order: 0 }];

function makePlace(over: Partial<Place> & { id: string }): Place {
  return {
    tripId: 't1',
    dayId: 'd1',
    name: over.id,
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
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

describe('PrintItinerary travel times', () => {
  it('prints a manual transit time as 公共交通 …（手入力） with no distance', () => {
    const places = [
      makePlace({
        id: 'A',
        name: 'A',
        order: 0,
        travelMinutes: 20,
        travelMode: 'transit',
        travelEstimateSource: 'manual',
      }),
      makePlace({ id: 'B', name: 'B', order: 1 }),
    ];
    render(<PrintItinerary trip={trip} days={days} places={places} />);
    expect(screen.getByText(/公共交通 20分（手入力）/)).toBeInTheDocument();
  });

  it('prints an auto walk leg with mode, time and distance', () => {
    const places = [
      makePlace({
        id: 'A',
        name: 'A',
        order: 0,
        travelMinutes: 18,
        travelMode: 'walk',
        travelDistanceMeters: 1300,
        travelEstimateSource: 'auto',
        travelToPlaceId: 'B',
      }),
      makePlace({ id: 'B', name: 'B', order: 1 }),
    ];
    render(<PrintItinerary trip={trip} days={days} places={places} />);
    expect(screen.getByText(/徒歩 18分・1.3km/)).toBeInTheDocument();
  });
});

describe('PrintItinerary does not fetch weather', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call fetch when rendering', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const places = [makePlace({ id: 'p1', name: 'スポット A', order: 0 })];
    render(<PrintItinerary trip={trip} days={days} places={places} />);
    // PrintItinerary must not trigger any network request
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
