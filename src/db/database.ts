import Dexie, { type EntityTable } from 'dexie';
import type { PlaceRecord, TripDayRecord, TripRecord } from './records';

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

  constructor(name = 'tabiori') {
    super(name);

    // v1 — initial schema. Indexes cover the queries the repositories run:
    // list trips by updatedAt, fetch days/places by tripId, order within a day.
    this.version(1).stores({
      trips: 'id, updatedAt, startDate',
      days: 'id, tripId, [tripId+order], date',
      places: 'id, tripId, dayId, [dayId+order]',
    });
  }
}

export const db = new TabioriDatabase();
