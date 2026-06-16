import { placeRepository } from '@/repositories/placeRepository';
import { tripRepository, type TripListItem } from '@/repositories/tripRepository';
import type { Place, Trip, TripDay } from '@/domain/types';
import { useLiveQueryResult, type LiveResult } from './useLiveQueryResult';

/** Reactive list of trip summaries for the trip list screen. */
export function useTripSummaries(): LiveResult<TripListItem[]> {
  return useLiveQueryResult(() => tripRepository.listSummaries(), []);
}

/** Reactive single trip (undefined when not found). */
export function useTrip(tripId: string | undefined): LiveResult<Trip | undefined> {
  return useLiveQueryResult(
    () => (tripId ? tripRepository.get(tripId) : Promise.resolve(undefined)),
    [tripId],
  );
}

/** Reactive ordered days for a trip. */
export function useTripDays(tripId: string | undefined): LiveResult<TripDay[]> {
  return useLiveQueryResult(
    () => (tripId ? tripRepository.listDays(tripId) : Promise.resolve([])),
    [tripId],
  );
}

/** Reactive ordered places for a whole trip. */
export function useTripPlaces(tripId: string | undefined): LiveResult<Place[]> {
  return useLiveQueryResult(
    () => (tripId ? placeRepository.listByTrip(tripId) : Promise.resolve([])),
    [tripId],
  );
}
