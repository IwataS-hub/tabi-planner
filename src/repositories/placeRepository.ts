import { db } from '@/db/database';
import { placeFromRecord } from '@/db/mappers';
import type { PlaceRecord } from '@/db/records';
import { DEFAULT_CATEGORY } from '@/domain/categories';
import type { Place, PlaceCategory } from '@/domain/types';
import { createId } from '@/lib/utils';
import { placeRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export const DEFAULT_PLACE_NAME = '名称未設定';

export interface NewPlaceInput {
  tripId: string;
  dayId: string;
  latitude: number;
  longitude: number;
  name?: string;
  category?: PlaceCategory;
}

/** Fields the editor may patch on an existing place. */
export type PlacePatch = Partial<
  Pick<
    Place,
    | 'name'
    | 'category'
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
    const now = nowIso();
    const order = await db.places.where('dayId').equals(input.dayId).count();
    const record: PlaceRecord = validateRecord(
      placeRecordSchema,
      {
        id: createId(),
        tripId: input.tripId,
        dayId: input.dayId,
        name: input.name?.trim() || DEFAULT_PLACE_NAME,
        category: input.category ?? DEFAULT_CATEGORY,
        latitude: input.latitude,
        longitude: input.longitude,
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
    await db.transaction('rw', db.places, db.trips, async () => {
      await db.places.add(record);
      await touchTrip(input.tripId);
    });
    return placeFromRecord(record);
  },

  async update(id: string, patch: PlacePatch): Promise<Place> {
    const existing = await db.places.get(id);
    if (!existing) throw new Error(`スポットが見つかりません: ${id}`);
    const record: PlaceRecord = validateRecord(
      placeRecordSchema,
      { ...existing, ...patch, updatedAt: nowIso() },
      'スポットの更新',
    );
    await db.transaction('rw', db.places, db.trips, async () => {
      await db.places.put(record);
      await touchTrip(record.tripId);
    });
    return placeFromRecord(record);
  },

  async remove(id: string): Promise<void> {
    const existing = await db.places.get(id);
    if (!existing) return;
    await db.transaction('rw', db.places, db.trips, async () => {
      await db.places.delete(id);
      // Re-pack the remaining spots in the day so order stays contiguous.
      const remaining = await db.places.where('dayId').equals(existing.dayId).sortBy('order');
      await db.places.bulkPut(remaining.map((place, index) => ({ ...place, order: index })));
      await touchTrip(existing.tripId);
    });
  },

  /** Clone a spot directly after the original within the same day. */
  async duplicate(id: string): Promise<Place> {
    const source = await db.places.get(id);
    if (!source) throw new Error(`スポットが見つかりません: ${id}`);
    const now = nowIso();
    let created: PlaceRecord | null = null;
    await db.transaction('rw', db.places, db.trips, async () => {
      const siblings = await db.places.where('dayId').equals(source.dayId).sortBy('order');
      const insertAt = source.order + 1;
      // Shift everything after the original down by one to make room.
      const shifted = siblings
        .filter((place) => place.order >= insertAt)
        .map((place) => ({ ...place, order: place.order + 1 }));
      if (shifted.length > 0) await db.places.bulkPut(shifted);

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
      await db.places.add(created);
      await touchTrip(source.tripId);
    });
    if (!created) throw new Error('スポットの複製に失敗しました');
    return placeFromRecord(created);
  },

  /** Persist a new within-day order given the ids in their desired sequence. */
  async reorderWithinDay(dayId: string, orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.places, db.trips, async () => {
      const places = await db.places.where('dayId').equals(dayId).toArray();
      const byId = new Map(places.map((place) => [place.id, place]));
      const updates: PlaceRecord[] = [];
      orderedIds.forEach((id, index) => {
        const place = byId.get(id);
        if (place && place.order !== index) {
          updates.push({ ...place, order: index });
        }
      });
      if (updates.length > 0) {
        await db.places.bulkPut(updates);
        await touchTrip(updates[0].tripId);
      }
    });
  },
};
