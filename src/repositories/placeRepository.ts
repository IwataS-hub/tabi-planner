import { db } from '@/db/database';
import { dayFromRecord, placeFromRecord } from '@/db/mappers';
import type { PlaceRecord } from '@/db/records';
import { DEFAULT_CATEGORY } from '@/domain/categories';
import type { ReverseGeocodeResult } from '@/domain/geocoding';
import { isTravelMode, routeKey, type TravelMode } from '@/domain/routing';
import type { Place, PlaceCategory } from '@/domain/types';
import { createId } from '@/lib/utils';
import { placeRecordSchema, tripDayRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export const DEFAULT_PLACE_NAME = '名称未設定';

/** The record fields that make up an auto travel estimate, all cleared to null. */
function clearedAutoTravel() {
  return {
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    travelToPlaceId: null,
    travelRouteKey: null,
    travelCalculatedAt: null,
  } as const;
}

/**
 * Within a transaction, invalidate AUTO travel estimates in a day that no longer
 * match their segment: the targeted next place changed (reorder/delete/
 * duplicate) or the from/to coordinates changed (route key mismatch). Only
 * estimates whose source is `auto` are touched — a manual `travelMinutes` is
 * never cleared here. The auto value (including `travelMinutes`) is wiped so a
 * stale time can never be shown for a different segment.
 */
export async function reconcileAutoTravelInDay(dayId: string): Promise<void> {
  const places = await db.places.where('dayId').equals(dayId).sortBy('order');
  const updates: PlaceRecord[] = [];
  for (let i = 0; i < places.length; i += 1) {
    const place = places[i];
    if (place.travelEstimateSource !== 'auto') continue;
    const next = places[i + 1];
    const mode = place.travelMode;
    const stillValid =
      next != null &&
      place.travelToPlaceId === next.id &&
      isTravelMode(mode) &&
      place.travelRouteKey ===
        routeKey(
          { latitude: place.latitude, longitude: place.longitude },
          { latitude: next.latitude, longitude: next.longitude },
          mode,
        );
    if (!stillValid) {
      updates.push({ ...place, travelMinutes: null, ...clearedAutoTravel(), updatedAt: nowIso() });
    }
  }
  if (updates.length > 0) await db.places.bulkPut(updates);
}

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
      await reconcileAutoTravelInDay(input.dayId);
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
      // Editing travelMinutes is a manual override: detach from any auto
      // estimate so the two are never confused.
      const manualTravelEdit = 'travelMinutes' in patch;
      const coordsChanged =
        ('latitude' in patch && patch.latitude !== existing.latitude) ||
        ('longitude' in patch && patch.longitude !== existing.longitude);
      const merged = { ...existing, ...patch, updatedAt: nowIso() };
      const next = manualTravelEdit
        ? {
            ...merged,
            ...clearedAutoTravel(),
            travelEstimateSource: merged.travelMinutes == null ? null : 'manual',
          }
        : merged;
      record = validateRecord(placeRecordSchema, next, 'スポットの更新');
      await db.places.put(record);
      // A coordinate change invalidates this leg and the preceding leg's auto
      // estimate (their route key no longer matches the current coordinates).
      if (coordsChanged) await reconcileAutoTravelInDay(record.dayId);
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
      // The spot before the removed one now has a new neighbour — drop any
      // auto estimate that no longer matches.
      await reconcileAutoTravelInDay(existing.dayId);
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
          // A clone is a new segment: never inherit the original's estimate.
          travelMinutes: null,
          ...clearedAutoTravel(),
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
      // The original now points at the clone — invalidate its stale estimate.
      await reconcileAutoTravelInDay(source.dayId);
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
        // Adjacency changed — drop auto estimates that no longer match.
        await reconcileAutoTravelInDay(dayId);
        await touchTrip(day.tripId);
      }
    });
  },

  /**
   * Persist an auto route estimate on the departure place. Re-verifies, inside
   * the transaction, that `fromPlaceId`'s current next spot is still
   * `toPlaceId` and that the coordinates still match `expectedRouteKey`; if a
   * reorder/delete/move happened while the request was in flight, nothing is
   * saved and `null` is returned (a stale result is never applied).
   */
  async saveRouteEstimate(input: {
    fromPlaceId: string;
    toPlaceId: string;
    mode: TravelMode;
    minutes: number;
    distanceMeters: number;
    expectedRouteKey: string;
    fromUpdatedAt: string;
    fromTravelMinutes: number | null;
    fromTravelEstimateSource: Place['travelEstimateSource'];
    calculatedAt: string;
  }): Promise<Place | null> {
    let saved: PlaceRecord | undefined;
    let stale = false;
    await db.transaction('rw', db.places, db.trips, async () => {
      const from = await db.places.get(input.fromPlaceId);
      if (!from) {
        stale = true;
        return;
      }
      const siblings = await db.places.where('dayId').equals(from.dayId).sortBy('order');
      const index = siblings.findIndex((place) => place.id === from.id);
      const next = siblings[index + 1];
      if (!next || next.id !== input.toPlaceId) {
        stale = true;
        return;
      }
      if (
        from.tripId !== next.tripId ||
        from.updatedAt !== input.fromUpdatedAt ||
        from.travelMinutes !== input.fromTravelMinutes ||
        from.travelEstimateSource !== input.fromTravelEstimateSource
      ) {
        stale = true;
        return;
      }
      const currentKey = routeKey(
        { latitude: from.latitude, longitude: from.longitude },
        { latitude: next.latitude, longitude: next.longitude },
        input.mode,
      );
      if (currentKey !== input.expectedRouteKey) {
        stale = true;
        return;
      }
      saved = validateRecord(
        placeRecordSchema,
        {
          ...from,
          travelMinutes: input.minutes,
          travelMode: input.mode,
          travelDistanceMeters: input.distanceMeters,
          travelEstimateSource: 'auto',
          travelToPlaceId: input.toPlaceId,
          travelRouteKey: input.expectedRouteKey,
          travelCalculatedAt: input.calculatedAt,
          updatedAt: nowIso(),
        },
        'ルート結果の保存',
      );
      await db.places.put(saved);
      await touchTrip(saved.tripId);
    });
    if (stale || !saved) return null;
    return placeFromRecord(saved);
  },
};

function toPlaceRecord(record: PlaceRecord): PlaceRecord {
  return validateRecord(placeRecordSchema, record, 'スポットデータ');
}
