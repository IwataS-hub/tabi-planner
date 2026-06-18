import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchTripWeather,
  setWeatherProvider,
  representativeCoordinate,
} from './weatherService';
import { clearWeatherCache } from './weatherCache';
import { WeatherError } from './weatherErrors';
import type { TripWeather } from '@/domain/weather';
import type { TripDay, Place } from '@/domain/types';

function makeDay(id: string, order: number): TripDay {
  return { id, tripId: 'trip1', date: '2026-07-01', order, createdAt: '', updatedAt: '' };
}

function makePlace(id: string, lat: number | null, lon: number | null): Place {
  return {
    id,
    tripId: 'trip1',
    dayId: 'day1',
    name: 'Test',
    category: 'sightseeing',
    address: '',
    latitude: lat,
    longitude: lon,
    stayMinutes: null,
    startTime: null,
    travelMinutes: null,
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    estimatedCost: null,
    url: '',
    memo: '',
    order: 0,
    visitStatus: 'planned',
    createdAt: '',
    updatedAt: '',
  };
}

const stubWeather: TripWeather = {
  fetchedAt: '2026-07-01T00:00:00.000Z',
  latitude: 35.0,
  longitude: 135.0,
  daily: [],
  hourly: [],
};

describe('representativeCoordinate', () => {
  it('returns null when no places exist', () => {
    const days = [makeDay('d1', 0)];
    const placesByDay: Record<string, Place[]> = {};
    expect(representativeCoordinate(days, placesByDay)).toBeNull();
  });

  it('returns null when places have no coords', () => {
    const days = [makeDay('d1', 0)];
    const placesByDay: Record<string, Place[]> = { d1: [makePlace('p1', null, null)] };
    const coord = representativeCoordinate(days, placesByDay);
    // Returns the LatLng but both fields are null
    expect(coord?.latitude).toBeNull();
    expect(coord?.longitude).toBeNull();
  });

  it('returns first place on first day by order', () => {
    const days = [makeDay('d1', 0), makeDay('d2', 1)];
    const placesByDay: Record<string, Place[]> = {
      d1: [makePlace('p1', 35.0, 135.0)],
      d2: [makePlace('p2', 34.0, 136.0)],
    };
    const coord = representativeCoordinate(days, placesByDay);
    expect(coord?.latitude).toBe(35.0);
    expect(coord?.longitude).toBe(135.0);
  });

  it('prefers specified day over first day', () => {
    const days = [makeDay('d1', 0), makeDay('d2', 1)];
    const placesByDay: Record<string, Place[]> = {
      d1: [makePlace('p1', 35.0, 135.0)],
      d2: [makePlace('p2', 34.0, 136.0)],
    };
    const coord = representativeCoordinate(days, placesByDay, 'd2');
    expect(coord?.latitude).toBe(34.0);
    expect(coord?.longitude).toBe(136.0);
  });
});

describe('fetchTripWeather', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const coordinate = { latitude: 35.0, longitude: 135.0 };

  beforeEach(() => {
    clearWeatherCache();
    setWeatherProvider({
      fetchWeather: vi.fn().mockResolvedValue(stubWeather),
    });
  });

  it('throws WeatherError when dates are out of range', async () => {
    await expect(
      fetchTripWeather(coordinate, '2025-01-01', '2025-01-05', today),
    ).rejects.toBeInstanceOf(WeatherError);
  });

  it('returns weather for in-range dates', async () => {
    const result = await fetchTripWeather(coordinate, today, tomorrow, today);
    expect(result).toEqual(stubWeather);
  });

  it('calls provider with clamped startDate when trip started before today', async () => {
    const mockFetch = vi.fn().mockResolvedValue(stubWeather);
    setWeatherProvider({ fetchWeather: mockFetch });

    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await fetchTripWeather(coordinate, yesterday, tomorrow, today);

    expect(mockFetch).toHaveBeenCalledOnce();
    const req = mockFetch.mock.calls[0][0];
    // startDate should be clamped to today
    expect(req.startDate).toBe(today);
  });

  it('caches second call with same params', async () => {
    const mockFetch = vi.fn().mockResolvedValue(stubWeather);
    setWeatherProvider({ fetchWeather: mockFetch });

    await fetchTripWeather(coordinate, today, tomorrow, today);
    await fetchTripWeather(coordinate, today, tomorrow, today);

    expect(mockFetch).toHaveBeenCalledOnce();
  });
});
