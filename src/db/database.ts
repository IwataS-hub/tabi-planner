import Dexie, { type EntityTable } from 'dexie';
import type {
  CandidatePlaceRecord,
  ChecklistItemRecord,
  ExpenseRecord,
  ExpenseShareRecord,
  ParticipantRecord,
  PlaceRecord,
  ReservationRecord,
  TripDayRecord,
  TripRecord,
} from './records';

/**
 * IndexedDB schema, isolated from all UI/React code. Only the repository layer
 * imports this module.
 *
 * Migration policy: each structural change adds a new `.version(n)` block with
 * an `upgrade` function. The Dexie store version is independent from the
 * per-record `schemaVersion` field, which lets repositories run record-level
 * data migrations lazily on read if ever needed.
 */
export class TabioriDatabase extends Dexie {
  trips!: EntityTable<TripRecord, 'id'>;
  days!: EntityTable<TripDayRecord, 'id'>;
  places!: EntityTable<PlaceRecord, 'id'>;
  participants!: EntityTable<ParticipantRecord, 'id'>;
  expenses!: EntityTable<ExpenseRecord, 'id'>;
  expenseShares!: EntityTable<ExpenseShareRecord, 'id'>;
  checklistItems!: EntityTable<ChecklistItemRecord, 'id'>;
  candidatePlaces!: EntityTable<CandidatePlaceRecord, 'id'>;
  reservations!: EntityTable<ReservationRecord, 'id'>;

  constructor(name = 'tabiori') {
    super(name);

    // v1 — initial schema.
    this.version(1).stores({
      trips: 'id, updatedAt, startDate',
      days: 'id, tripId, [tripId+order], date',
      places: 'id, tripId, dayId, [dayId+order]',
    });

    // v2 — Phase 2.3: participants, expenses, expenseShares, checklistItems.
    // Existing trips/days/places are preserved; new tables start empty.
    this.version(2).stores({
      trips: 'id, updatedAt, startDate',
      days: 'id, tripId, [tripId+order], date',
      places: 'id, tripId, dayId, [dayId+order]',
      participants: 'id, tripId, [tripId+order]',
      expenses: 'id, tripId, dayId, placeId, payerId',
      expenseShares: 'id, expenseId, participantId',
      checklistItems: 'id, tripId, [tripId+order], kind',
    });

    // v3 — Phase 2.4: candidatePlaces, reservations.
    this.version(3).stores({
      trips: 'id, updatedAt, startDate',
      days: 'id, tripId, [tripId+order], date',
      places: 'id, tripId, dayId, [dayId+order]',
      participants: 'id, tripId, [tripId+order]',
      expenses: 'id, tripId, dayId, placeId, payerId',
      expenseShares: 'id, expenseId, participantId',
      checklistItems: 'id, tripId, [tripId+order], kind',
      candidatePlaces: 'id, tripId, [tripId+order]',
      reservations: 'id, tripId, dayId, placeId',
    });
  }
}

export const db = new TabioriDatabase();
