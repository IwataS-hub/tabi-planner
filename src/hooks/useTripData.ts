import { placeRepository } from '@/repositories/placeRepository';
import { tripRepository, type TripListItem } from '@/repositories/tripRepository';
import { participantRepository } from '@/repositories/participantRepository';
import { expenseRepository, type ExpenseWithShares } from '@/repositories/expenseRepository';
import { checklistItemRepository } from '@/repositories/checklistItemRepository';
import { candidatePlaceRepository } from '@/repositories/candidatePlaceRepository';
import { reservationRepository } from '@/repositories/reservationRepository';
import type {
  CandidatePlace,
  ChecklistItem,
  ChecklistKind,
  Participant,
  Place,
  Reservation,
  Trip,
  TripDay,
} from '@/domain/types';
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

/** Reactive participants for a trip. */
export function useTripParticipants(tripId: string | undefined): LiveResult<Participant[]> {
  return useLiveQueryResult(
    () => (tripId ? participantRepository.listByTrip(tripId) : Promise.resolve([])),
    [tripId],
  );
}

/** Reactive expenses (with shares) for a trip. */
export function useTripExpenses(tripId: string | undefined): LiveResult<ExpenseWithShares[]> {
  return useLiveQueryResult(
    () => (tripId ? expenseRepository.listByTrip(tripId) : Promise.resolve([])),
    [tripId],
  );
}

/** Reactive checklist items for a trip. */
export function useTripChecklist(
  tripId: string | undefined,
  kind?: ChecklistKind,
): LiveResult<ChecklistItem[]> {
  return useLiveQueryResult(
    () => (tripId ? checklistItemRepository.listByTrip(tripId, kind) : Promise.resolve([])),
    [tripId, kind],
  );
}

/** Reactive candidate (unscheduled) places for a trip. */
export function useTripCandidates(tripId: string | undefined): LiveResult<CandidatePlace[]> {
  return useLiveQueryResult(
    () => (tripId ? candidatePlaceRepository.listByTrip(tripId) : Promise.resolve([])),
    [tripId],
  );
}

/** Reactive reservations for a trip. */
export function useTripReservations(tripId: string | undefined): LiveResult<Reservation[]> {
  return useLiveQueryResult(
    () => (tripId ? reservationRepository.listByTrip(tripId) : Promise.resolve([])),
    [tripId],
  );
}
