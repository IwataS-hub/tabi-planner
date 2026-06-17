import { db } from '@/db/database';
import { dayFromRecord, tripFromRecord } from '@/db/mappers';
import type { PlaceRecord, TripDayRecord, TripRecord } from '@/db/records';
import { CURRENT_SCHEMA_VERSION, type Trip, type TripDay } from '@/domain/types';
import { buildBackup, type TripBackup } from '@/domain/backup';
import { eachDateInRange } from '@/lib/date';
import { createId } from '@/lib/utils';
import {
  placeRecordSchema,
  tripDayRecordSchema,
  tripFormSchema,
  tripRecordSchema,
} from '@/validation/schemas';
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
async function syncDaysInTransaction(
  tripId: string,
  startDate: string,
  endDate: string,
): Promise<void> {
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

  if (removedDays.length > 0 && lastDayId) {
    const removedIds = removedDays.map((day) => day.id);
    const removedOrder = new Map(removedDays.map((day) => [day.id, day.order]));
    const orphans = await db.places.where('dayId').anyOf(removedIds).toArray();
    if (orphans.length > 0) {
      const lastDayPlaces = await db.places.where('dayId').equals(lastDayId).sortBy('order');
      const tail =
        lastDayPlaces.length === 0 ? 0 : Math.max(...lastDayPlaces.map((p) => p.order)) + 1;
      const moved = orphans
        .sort((a, b) => {
          const dayDelta = (removedOrder.get(a.dayId) ?? 0) - (removedOrder.get(b.dayId) ?? 0);
          return dayDelta || a.order - b.order;
        })
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
    const values = validateRecord(tripFormSchema, draft, '旅行の作成');
    const now = nowIso();
    const id = createId();
    const record: TripRecord = validateRecord(
      tripRecordSchema,
      {
        id,
        title: values.title,
        description: values.description,
        startDate: values.startDate,
        endDate: values.endDate,
        createdAt: now,
        updatedAt: now,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      '旅行の作成',
    );
    const days = buildDayRecords(id, values.startDate, values.endDate).map((day) =>
      validateRecord(tripDayRecordSchema, day, '日付データ'),
    );
    await db.transaction('rw', db.trips, db.days, async () => {
      await db.trips.add(record);
      await db.days.bulkAdd(days);
    });
    return tripFromRecord(record);
  },

  async updateDetails(id: string, draft: TripDraft): Promise<Trip> {
    const values = validateRecord(tripFormSchema, draft, '旅行の更新');
    let saved: TripRecord | undefined;
    await db.transaction('rw', db.trips, db.days, db.places, async () => {
      const existing = await db.trips.get(id);
      if (!existing) throw new Error(`旅行が見つかりません: ${id}`);
      const current = validateRecord(tripRecordSchema, existing, '旅行データ');
      const datesChanged =
        current.startDate !== values.startDate || current.endDate !== values.endDate;
      saved = validateRecord(
        tripRecordSchema,
        {
          ...current,
          title: values.title,
          description: values.description,
          startDate: values.startDate,
          endDate: values.endDate,
          updatedAt: nowIso(),
        },
        '旅行の更新',
      );
      await db.trips.put(saved);
      if (datesChanged) {
        await syncDaysInTransaction(id, values.startDate, values.endDate);
      }
    });
    if (!saved) throw new Error('旅行の更新に失敗しました');
    return tripFromRecord(saved);
  },

  /** Bump only the trip's updatedAt (called by place edits to reflect recency). */
  async touch(id: string): Promise<void> {
    await db.trips.update(id, { updatedAt: nowIso() });
  },

  async duplicate(id: string): Promise<Trip> {
    const sourceRecord = await db.trips.get(id);
    if (!sourceRecord) throw new Error(`旅行が見つかりません: ${id}`);
    const source = validateRecord(tripRecordSchema, sourceRecord, '旅行データ');
    const days = (await db.days.where('tripId').equals(id).toArray()).map((day) =>
      validateRecord(tripDayRecordSchema, day, '日付データ'),
    );
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
    const newPlaces: PlaceRecord[] = places.map((record) => {
      const place = validateRecord(placeRecordSchema, record, 'スポットデータ');
      const dayId = dayIdMap.get(place.dayId);
      if (!dayId) throw new Error(`スポットの日付データが見つかりません: ${place.id}`);
      return validateRecord(
        placeRecordSchema,
        {
          ...place,
          id: createId(),
          tripId: newTripId,
          dayId,
          createdAt: now,
          updatedAt: now,
        },
        'スポットの複製',
      );
    });

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

  /** Build a self-contained backup of one trip (trip + days + places). */
  async exportTrip(id: string): Promise<TripBackup> {
    const tripRecord = await db.trips.get(id);
    if (!tripRecord) throw new Error(`旅行が見つかりません: ${id}`);
    const trip = validateRecord(tripRecordSchema, tripRecord, '旅行データ');
    const days = (await db.days.where('tripId').equals(id).sortBy('order')).map((day) =>
      validateRecord(tripDayRecordSchema, day, '日付データ'),
    );
    const places = (await db.places.where('tripId').equals(id).sortBy('order')).map((place) =>
      validateRecord(placeRecordSchema, place, 'スポットデータ'),
    );
    return buildBackup(trip, days, places);
  },

  /**
   * Import a validated backup as a brand-new trip. All ids (trip/day/place) are
   * regenerated and the tripId/dayId relationships are rewired accordingly; the
   * existing trip is never touched. The whole insert runs in a single
   * transaction, so a mid-way failure rolls back completely (no partial save).
   * The caller is responsible for validating the backup (see `parseBackup`).
   */
  async importBackup(backup: TripBackup): Promise<Trip> {
    const now = nowIso();
    const newTripId = createId();
    const dayIdMap = new Map<string, string>();

    let savedTrip: TripRecord | undefined;
    await db.transaction('rw', db.trips, db.days, db.places, async () => {
      // Avoid title collisions with existing trips.
      const existingTitles = new Set((await db.trips.toArray()).map((trip) => trip.title));
      let title = backup.trip.title;
      if (existingTitles.has(title)) {
        const baseTitle = title;
        let suffix = 2;
        title = `${baseTitle}（読み込み）`;
        while (existingTitles.has(title)) {
          title = `${baseTitle}（読み込み ${suffix}）`;
          suffix += 1;
        }
      }

      const newTrip = validateRecord(
        tripRecordSchema,
        {
          ...backup.trip,
          id: newTripId,
          title,
          createdAt: now,
          updatedAt: now,
          schemaVersion: CURRENT_SCHEMA_VERSION,
        },
        '旅行の読み込み',
      );
      const newDays: TripDayRecord[] = backup.days.map((day) => {
        const newId = createId();
        dayIdMap.set(day.id, newId);
        return validateRecord(
          tripDayRecordSchema,
          { ...day, id: newId, tripId: newTripId },
          '日付データの読み込み',
        );
      });
      const newPlaces: PlaceRecord[] = backup.places.map((place) => {
        const dayId = dayIdMap.get(place.dayId);
        if (!dayId) throw new Error(`スポットが参照する日付データが見つかりません: ${place.id}`);
        return validateRecord(
          placeRecordSchema,
          { ...place, id: createId(), tripId: newTripId, dayId, createdAt: now, updatedAt: now },
          'スポットの読み込み',
        );
      });

      await db.trips.add(newTrip);
      await db.days.bulkAdd(newDays);
      if (newPlaces.length > 0) await db.places.bulkAdd(newPlaces);
      savedTrip = newTrip;
    });

    if (!savedTrip) throw new Error('旅行の読み込みに失敗しました');
    return tripFromRecord(savedTrip);
  },
};
