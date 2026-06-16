import { db } from '@/db/database';
import { dayFromRecord, tripFromRecord } from '@/db/mappers';
import type { PlaceRecord, TripDayRecord, TripRecord } from '@/db/records';
import { CURRENT_SCHEMA_VERSION, type Trip, type TripDay } from '@/domain/types';
import { eachDateInRange } from '@/lib/date';
import { createId } from '@/lib/utils';
import { tripDayRecordSchema, tripRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export interface TripDraft {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
}

/** Trip plus derived counts for the list screen. */
export interface TripListItem {
  trip: Trip;
  placeCount: number;
}

function buildDayRecords(tripId: string, startDate: string, endDate: string): TripDayRecord[] {
  return eachDateInRange(startDate, endDate).map((date, index) => ({
    id: createId(),
    tripId,
    date,
    order: index,
  }));
}

/**
 * Reconcile a trip's day rows with a (possibly new) date range. Days are derived
 * from the range: existing dates are kept (preserving their id and places), new
 * dates are added, and dates that fall out of range are removed. Places on a
 * removed day are moved to the last remaining day so nothing is silently lost.
 */
async function syncDays(tripId: string, startDate: string, endDate: string): Promise<void> {
  const desiredDates = eachDateInRange(startDate, endDate);
  const existing = await db.days.where('tripId').equals(tripId).toArray();
  const existingByDate = new Map(existing.map((day) => [day.date, day]));

  const nextDays: TripDayRecord[] = desiredDates.map((date, index) => {
    const reused = existingByDate.get(date);
    return reused ? { ...reused, order: index } : { id: createId(), tripId, date, order: index };
  });

  const keptIds = new Set(nextDays.map((day) => day.id));
  const removedDays = existing.filter((day) => !keptIds.has(day.id));
  const lastDayId = nextDays.at(-1)?.id;

  await db.transaction('rw', db.days, db.places, async () => {
    if (removedDays.length > 0 && lastDayId) {
      const removedIds = removedDays.map((day) => day.id);
      const orphans = await db.places.where('dayId').anyOf(removedIds).toArray();
      if (orphans.length > 0) {
        const tail = await db.places.where('dayId').equals(lastDayId).count();
        const moved = orphans
          .sort((a, b) => a.order - b.order)
          .map((place, index) => ({ ...place, dayId: lastDayId, order: tail + index }));
        await db.places.bulkPut(moved);
      }
      await db.days.bulkDelete(removedIds);
    } else if (removedDays.length > 0) {
      // No remaining days (only possible on an empty range, which validation
      // prevents) — drop the orphaned places rather than leak them.
      const removedIds = removedDays.map((day) => day.id);
      await db.places.where('dayId').anyOf(removedIds).delete();
      await db.days.bulkDelete(removedIds);
    }
    await db.days.bulkPut(nextDays);
  });
}

export const tripRepository = {
  /** All trips, most-recently-updated first, with place counts. */
  async listSummaries(): Promise<TripListItem[]> {
    const records = await db.trips.orderBy('updatedAt').reverse().toArray();
    const items: TripListItem[] = [];
    for (const record of records) {
      const trip = tripFromRecord(validateRecord(tripRecordSchema, record, '旅行データ'));
      const placeCount = await db.places.where('tripId').equals(trip.id).count();
      items.push({ trip, placeCount });
    }
    return items;
  },

  async get(id: string): Promise<Trip | undefined> {
    const record = await db.trips.get(id);
    if (!record) return undefined;
    return tripFromRecord(validateRecord(tripRecordSchema, record, '旅行データ'));
  },

  async create(draft: TripDraft): Promise<Trip> {
    const now = nowIso();
    const id = createId();
    const record: TripRecord = validateRecord(
      tripRecordSchema,
      {
        id,
        title: draft.title,
        description: draft.description,
        startDate: draft.startDate,
        endDate: draft.endDate,
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      '旅行の作成',
    );
    const days = buildDayRecords(id, draft.startDate, draft.endDate).map((day) =>
      validateRecord(tripDayRecordSchema, day, '日付データ'),
    );
    await db.transaction('rw', db.trips, db.days, async () => {
      await db.trips.add(record);
      await db.days.bulkAdd(days);
    });
    return tripFromRecord(record);
  },

  async updateDetails(id: string, draft: TripDraft): Promise<Trip> {
    const existing = await db.trips.get(id);
    if (!existing) throw new Error(`旅行が見つかりません: ${id}`);
    const datesChanged =
      existing.startDate !== draft.startDate || existing.endDate !== draft.endDate;
    const record: TripRecord = validateRecord(
      tripRecordSchema,
      {
        ...existing,
        title: draft.title,
        description: draft.description,
        startDate: draft.startDate,
        endDate: draft.endDate,
        updatedAt: nowIso(),
      },
      '旅行の更新',
    );
    await db.trips.put(record);
    if (datesChanged) {
      await syncDays(id, draft.startDate, draft.endDate);
    }
    return tripFromRecord(record);
  },

  /** Bump only the trip's updatedAt (called by place edits to reflect recency). */
  async touch(id: string): Promise<void> {
    await db.trips.update(id, { updatedAt: nowIso() });
  },

  async duplicate(id: string): Promise<Trip> {
    const source = await db.trips.get(id);
    if (!source) throw new Error(`旅行が見つかりません: ${id}`);
    const days = await db.days.where('tripId').equals(id).toArray();
    const places = await db.places.where('tripId').equals(id).toArray();

    const now = nowIso();
    const newTripId = createId();
    const dayIdMap = new Map<string, string>();

    const newTrip: TripRecord = {
      ...source,
      id: newTripId,
      title: `${source.title}（コピー）`,
      createdAt: now,
      updatedAt: now,
    };
    const newDays: TripDayRecord[] = days.map((day) => {
      const newId = createId();
      dayIdMap.set(day.id, newId);
      return { ...day, id: newId, tripId: newTripId };
    });
    const newPlaces: PlaceRecord[] = places.map((place) => ({
      ...place,
      id: createId(),
      tripId: newTripId,
      dayId: dayIdMap.get(place.dayId) ?? place.dayId,
      createdAt: now,
      updatedAt: now,
    }));

    await db.transaction('rw', db.trips, db.days, db.places, async () => {
      await db.trips.add(newTrip);
      await db.days.bulkAdd(newDays);
      if (newPlaces.length > 0) await db.places.bulkAdd(newPlaces);
    });
    return tripFromRecord(newTrip);
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.trips, db.days, db.places, async () => {
      await db.places.where('tripId').equals(id).delete();
      await db.days.where('tripId').equals(id).delete();
      await db.trips.delete(id);
    });
  },

  /** Days for a trip, ordered. */
  async listDays(tripId: string): Promise<TripDay[]> {
    const records = await db.days.where('tripId').equals(tripId).sortBy('order');
    return records.map((record) =>
      dayFromRecord(validateRecord(tripDayRecordSchema, record, '日付データ')),
    );
  },
};
