import { db } from '@/db/database';
import { candidatePlaceFromRecord } from '@/db/mappers';
import type { CandidatePlaceRecord } from '@/db/records';
import { DEFAULT_CATEGORY } from '@/domain/categories';
import type { CandidatePlace, PlaceCategory } from '@/domain/types';
import { createId } from '@/lib/utils';
import { candidatePlaceRecordSchema, placeRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';
import { reconcileAutoTravelInDay } from './placeRepository';

export interface NewCandidateInput {
  tripId: string;
  name?: string;
  category?: PlaceCategory;
  latitude: number;
  longitude: number;
  address?: string | null;
}

export type CandidatePatch = Partial<
  Pick<
    CandidatePlace,
    | 'name'
    | 'category'
    | 'address'
    | 'startTime'
    | 'stayMinutes'
    | 'memo'
    | 'url'
    | 'estimatedCost'
    | 'visitStatus'
  >
>;

function toCandidate(record: CandidatePlaceRecord): CandidatePlace {
  return candidatePlaceFromRecord(
    validateRecord(candidatePlaceRecordSchema, record, '候補スポットデータ'),
  );
}

async function touchTrip(tripId: string): Promise<void> {
  await db.trips.update(tripId, { updatedAt: nowIso() });
}

export const DEFAULT_CANDIDATE_NAME = '名称未設定';

export const candidatePlaceRepository = {
  async listByTrip(tripId: string): Promise<CandidatePlace[]> {
    const records = await db.candidatePlaces.where('tripId').equals(tripId).sortBy('order');
    return records.map(toCandidate);
  },

  async get(id: string): Promise<CandidatePlace | undefined> {
    const record = await db.candidatePlaces.get(id);
    if (!record) return undefined;
    return toCandidate(record);
  },

  async add(input: NewCandidateInput): Promise<CandidatePlace> {
    let record: CandidatePlaceRecord | undefined;
    await db.transaction('rw', db.trips, db.candidatePlaces, async () => {
      const now = nowIso();
      const order = await db.candidatePlaces.where('tripId').equals(input.tripId).count();
      record = validateRecord(
        candidatePlaceRecordSchema,
        {
          id: createId(),
          tripId: input.tripId,
          name: input.name?.trim() || DEFAULT_CANDIDATE_NAME,
          category: input.category ?? DEFAULT_CATEGORY,
          latitude: input.latitude,
          longitude: input.longitude,
          address: input.address ?? null,
          startTime: null,
          stayMinutes: null,
          memo: '',
          url: '',
          estimatedCost: null,
          visitStatus: 'planned',
          order,
          createdAt: now,
          updatedAt: now,
        },
        '候補スポットの追加',
      );
      await db.candidatePlaces.add(record);
      await touchTrip(input.tripId);
    });
    if (!record) throw new Error('候補スポットの追加に失敗しました');
    return candidatePlaceFromRecord(record);
  },

  async update(id: string, patch: CandidatePatch): Promise<CandidatePlace> {
    let record: CandidatePlaceRecord | undefined;
    await db.transaction('rw', db.trips, db.candidatePlaces, async () => {
      const existing = await db.candidatePlaces.get(id);
      if (!existing) throw new Error(`候補スポットが見つかりません: ${id}`);
      record = validateRecord(
        candidatePlaceRecordSchema,
        { ...existing, ...patch, updatedAt: nowIso() },
        '候補スポットの更新',
      );
      await db.candidatePlaces.put(record);
      await touchTrip(record.tripId);
    });
    if (!record) throw new Error('候補スポットの更新に失敗しました');
    return candidatePlaceFromRecord(record);
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.trips, db.candidatePlaces, async () => {
      const existing = await db.candidatePlaces.get(id);
      if (!existing) return;
      await db.candidatePlaces.delete(id);
      const remaining = await db.candidatePlaces
        .where('tripId')
        .equals(existing.tripId)
        .sortBy('order');
      await db.candidatePlaces.bulkPut(remaining.map((c, i) => ({ ...c, order: i })));
      await touchTrip(existing.tripId);
    });
  },

  /** Promote a candidate to a scheduled place in the given day. */
  async promoteToDay(id: string, dayId: string): Promise<void> {
    await db.transaction('rw', db.trips, db.days, db.candidatePlaces, db.places, async () => {
      const candidate = await db.candidatePlaces.get(id);
      if (!candidate) throw new Error(`候補スポットが見つかりません: ${id}`);
      const day = await db.days.get(dayId);
      if (!day) throw new Error(`日付データが見つかりません: ${dayId}`);
      if (day.tripId !== candidate.tripId) {
        throw new Error('候補スポットと日付データの旅行IDが一致しません');
      }
      const now = nowIso();
      const order = await db.places.where('dayId').equals(dayId).count();
      const placeRecord = validateRecord(
        placeRecordSchema,
        {
          id: createId(),
          tripId: candidate.tripId,
          dayId,
          name: candidate.name,
          category: candidate.category,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          address: candidate.address,
          startTime: candidate.startTime,
          stayMinutes: candidate.stayMinutes,
          travelMinutes: null,
          memo: candidate.memo,
          url: candidate.url,
          estimatedCost: candidate.estimatedCost,
          visitStatus: candidate.visitStatus,
          travelMode: null,
          travelDistanceMeters: null,
          travelEstimateSource: null,
          travelToPlaceId: null,
          travelRouteKey: null,
          travelCalculatedAt: null,
          order,
          createdAt: now,
          updatedAt: now,
        },
        'スポットへの昇格',
      );
      await db.places.add(placeRecord);
      await reconcileAutoTravelInDay(dayId);
      // Remove from candidates and repack
      await db.candidatePlaces.delete(id);
      const remaining = await db.candidatePlaces
        .where('tripId')
        .equals(candidate.tripId)
        .sortBy('order');
      await db.candidatePlaces.bulkPut(remaining.map((c, i) => ({ ...c, order: i })));
      await touchTrip(candidate.tripId);
    });
  },

  async reorder(tripId: string, orderedIds: string[]): Promise<void> {
    await db.transaction('rw', db.trips, db.candidatePlaces, async () => {
      const candidates = await db.candidatePlaces.where('tripId').equals(tripId).toArray();
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const seen = new Set<string>();
      const currentOrder = candidates.sort((a, b) => a.order - b.order).map((c) => c.id);
      const nextOrder = [
        ...orderedIds.filter((id) => {
          if (!byId.has(id) || seen.has(id)) return false;
          seen.add(id);
          return true;
        }),
        ...currentOrder.filter((id) => !seen.has(id)),
      ];
      const updates: CandidatePlaceRecord[] = [];
      nextOrder.forEach((id, index) => {
        const c = byId.get(id);
        if (c && c.order !== index) updates.push({ ...c, order: index });
      });
      if (updates.length > 0) {
        await db.candidatePlaces.bulkPut(updates);
        await touchTrip(tripId);
      }
    });
  },
};
