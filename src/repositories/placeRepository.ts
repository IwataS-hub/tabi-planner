import { db } from '@/db/database';
import { dayFromRecord, placeFromRecord } from '@/db/mappers';
import type { PlaceRecord } from '@/db/records';
import { DEFAULT_CATEGORY } from '@/domain/categories';
import type { ReverseGeocodeResult } from '@/domain/geocoding';
import type { Place, PlaceCategory } from '@/domain/types';
import { createId } from '@/lib/utils';
import { placeRecordSchema, tripDayRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export const DEFAULT_PLACE_NAME = '名称未設定';

/**
 * Build the patch to apply a reverse-geocoding result to an existing place,
 * or `null` when nothing should change. Pure so it can be unit-tested.
 *
 * Safety rules (background result must never clobber the user):
 * - Address is filled only when the place has none yet.
 * - Name is filled only when it is still the default placeholder — a name the
 *   user has already edited is left untouched.
 */
export function reverseGeocodePatch(place: Place, result: ReverseGeocodeResult): PlacePatch | null {
  const patch: PlacePatch = {};
  const hasAddress = place.address != null && place.address.trim() !== '';
  if (result.address && !hasAddress) patch.address = result.address;
  if (result.name && place.name === DEFAULT_PLACE_NAME) patch.name = result.name;
  return Object.keys(patch).length > 0 ? patch : null;
}

export interface NewPlaceInput {
  tripId: string;
  dayId: string;
  latitude: number;
  longitude: number;
  name?: string;
  category?: PlaceCategory;
  address?: string | null;
}

/** Fields the editor may patch on an existing place. */
export type PlacePatch = Partial<
  Pick<
    Place,
    | 'name'
    | 'category'
    | 'address'
    | 'startTime'
    | 'stayMinutes'
    | 'travelMinutes'
    | 'memo'
    | 'url'
    | 'estimatedCost'
    | 'latitude'
    | 'longitude'
  >
>;

async function touchTrip(tripId: string): Promise<void> {
  await db.trips.update(tripId, { updatedAt: nowIso() });
}

function toPlace(record: PlaceRecord): Place {
  return placeFromRecord(validateRecord(placeRecordSchema, record, 'スポットデータ'));
}

export const placeRepository = {
  /** A single place by id, or undefined when it no longer exists. */
  async get(id: string): Promise<Place | undefined> {
    const record = await db.places.get(id);
    if (!record) return undefined;
    return toPlace(record);
  },

  async listByTrip(tripId: string): Promise<Place[]> {
    const records = await db.places.where('tripId').equals(tripId).toArray();
    return records.map(toPlace).sort((a, b) => a.order - b.order);
  },

  async listByDay(dayId: string): Promise<Place[]> {
    const records = await db.places.where('dayId').equals(dayId).sortBy('order');
    return records.map(toPlace);
  },

  /** Append a new spot to the end of its day. */
  async add(input: NewPlaceInput): Promise<Place> {
    let record: PlaceRecord | undefined;
    await db.transaction('rw', db.trips, db.days, db.places, async () => {
      const dayRecord = await db.days.get(input.dayId);
      if (!dayRecord) throw new Error(`日付データが見つかりません: ${input.dayId}`);
      const day = dayFromRecord(validateRecord(tripDayRecordSchema, dayRecord, '日付データ'));
      if (day.tripId !== input.tripId) {
        throw new Error('スポットの旅行IDと日付データの旅行IDが一致しません');
      }

      const now = nowIso();
      const order = await db.places.where('dayId').equals(input.dayId).count();
      record = validateRecord(
        placeRecordSchema,
        {
          id: createId(),
          tripId: input.tripId,
          dayId: input.dayId,
          name: input.name?.trim() || DEFAULT_PLACE_NAME,
          category: input.category ?? DEFAULT_CATEGORY,
          latitude: input.latitude,
          longitude: input.longitude,
          // Schema normalises blank/whitespace to null and caps the length.
          address: input.address ?? null,
          startTime: null,
          stayMinutes: null,
          travelMinutes: null,
          memo: '',
          url: '',
          estimatedCost: null,
          order,
          createdAt: now,
          updatedAt: now,
        },
        'スポットの追加',
      );
      await db.places.add(record);
      await touchTrip(input.tripId);
    });
    if (!record) throw new Error('スポットの追加に失敗しました');
    return placeFromRecord(record);
  },

  async update(id: string, patch: PlacePatch): Promise<Place> {
    let record: PlaceRecord | undefined;
    await db.transaction('rw', db.places, db.trips, async () => {
      const existing = await db.places.get(id);
      if (!existing) throw new Error(`スポットが見つかりません: ${id}`);
      record = validateRecord(
        placeRecordSchema,
        { ...existing, ...patch, updatedAt: nowIso() },
        'スポットの更新',
      );
      await db.places.put(record);
      await touchTrip(record.tripId);
    });
    if (!record) throw new Error('スポットの更新に失敗しました');
    return placeFromRecord(record);
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.places, db.trips, async () => {
      const existing = await db.places.get(id);
      if (!existing) return;
      await db.places.delete(id);
      // Re-pack the remaining spots in the day so order stays contiguous.
      const remaining = await db.places.where('dayId').equals(existing.dayId).sortBy('order');
      await db.places.bulkPut(remaining.map((place, index) => ({ ...place, order: index })));
      await touchTrip(existing.tripId);
    });
  },

  /** Clone a spot directly after the original within the same day. */
  async duplicate(id: string): Promise<Place> {
    let created: PlaceRecord | undefined;
    await db.transaction('rw', db.places, db.trips, async () => {
      const sourceRecord = await db.places.get(id);
      if (!sourceRecord) throw new Error(`スポットが見つかりません: ${id}`);
      const source = validateRecord(placeRecordSchema, sourceRecord, 'スポットデータ');
      const siblings = (await db.places.where('dayId').equals(source.dayId).sortBy('order')).map(
        toPlaceRecord,
      );
      const sourceIndex = siblings.findIndex((place) => place.id === source.id);
      if (sourceIndex === -1) throw new Error(`スポットが見つかりません: ${id}`);
      const now = nowIso();
      const insertAt = sourceIndex + 1;

      created = validateRecord(
        placeRecordSchema,
        {
          ...source,
          id: createId(),
          name: `${source.name}のコピー`,
          order: insertAt,
          createdAt: now,
          updatedAt: now,
        },
        'スポットの複製',
      );
      const reordered = [...siblings.slice(0, insertAt), created, ...siblings.slice(insertAt)].map(
        (place, index) => ({ ...place, order: index }),
      );
      const existingUpdates = reordered.filter((place) => place.id !== created?.id);
      if (existingUpdates.length > 0) await db.places.bulkPut(existingUpdates);
      await db.places.add(created);
      await touchTrip(source.tripId);
    });
    if (!created) throw new Error('スポットの複製に失敗しました');
    return placeFromRecord(created);
  },

  /** Persist a new within-day order given the ids in their desired sequence. */
  async reorderWithinDay(dayId: string, orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.trips, db.days, db.places, async () => {
      const dayRecord = await db.days.get(dayId);
      if (!dayRecord) throw new Error(`日付データが見つかりません: ${dayId}`);
      const day = validateRecord(tripDayRecordSchema, dayRecord, '日付データ');
      const places = await db.places.where('dayId').equals(dayId).toArray();
      const byId = new Map(places.map((place) => [place.id, place]));
      const currentOrder = places.sort((a, b) => a.order - b.order).map((place) => place.id);
      const seen = new Set<string>();
      const nextOrder = [
        ...orderedIds.filter((id) => {
          if (!byId.has(id) || seen.has(id)) return false;
          seen.add(id);
          return true;
        }),
        ...currentOrder.filter((id) => !seen.has(id)),
      ];
      const updates: PlaceRecord[] = [];
      nextOrder.forEach((id, index) => {
        const place = byId.get(id);
        if (place && place.order !== index) {
          updates.push({ ...place, order: index });
        }
      });
      if (updates.length > 0) {
        await db.places.bulkPut(updates);
        await touchTrip(day.tripId);
      }
    });
  },
};

function toPlaceRecord(record: PlaceRecord): PlaceRecord {
  return validateRecord(placeRecordSchema, record, 'スポットデータ');
}
