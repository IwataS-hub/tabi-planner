import { db } from '@/db/database';
import { reservationFromRecord } from '@/db/mappers';
import type { ReservationRecord } from '@/db/records';
import type { Reservation, ReservationKind } from '@/domain/types';
import { createId } from '@/lib/utils';
import { reservationRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export interface NewReservationInput {
  tripId: string;
  dayId?: string | null;
  placeId?: string | null;
  kind: ReservationKind;
  title: string;
  startAt?: string | null;
  endAt?: string | null;
  location?: string;
  confirmationCode?: string;
  url?: string;
  phone?: string;
  memo?: string;
  isPrivate?: boolean;
}

export type ReservationPatch = Partial<
  Pick<
    Reservation,
    | 'dayId'
    | 'placeId'
    | 'kind'
    | 'title'
    | 'startAt'
    | 'endAt'
    | 'location'
    | 'confirmationCode'
    | 'url'
    | 'phone'
    | 'memo'
    | 'isPrivate'
  >
>;

function toReservation(record: ReservationRecord): Reservation {
  return reservationFromRecord(validateRecord(reservationRecordSchema, record, '予約データ'));
}

async function touchTrip(tripId: string): Promise<void> {
  await db.trips.update(tripId, { updatedAt: nowIso() });
}

export const reservationRepository = {
  async listByTrip(tripId: string): Promise<Reservation[]> {
    const records = await db.reservations.where('tripId').equals(tripId).toArray();
    return records
      .map(toReservation)
      .sort(
        (a, b) =>
          (a.startAt ?? '').localeCompare(b.startAt ?? '') ||
          a.createdAt.localeCompare(b.createdAt),
      );
  },

  async listByDay(dayId: string): Promise<Reservation[]> {
    const records = await db.reservations.where('dayId').equals(dayId).toArray();
    return records
      .map(toReservation)
      .sort((a, b) => (a.startAt ?? '').localeCompare(b.startAt ?? ''));
  },

  async get(id: string): Promise<Reservation | undefined> {
    const record = await db.reservations.get(id);
    if (!record) return undefined;
    return toReservation(record);
  },

  async add(input: NewReservationInput): Promise<Reservation> {
    let record: ReservationRecord | undefined;
    await db.transaction('rw', db.trips, db.days, db.places, db.reservations, async () => {
      const trip = await db.trips.get(input.tripId);
      if (!trip) throw new Error(`旅行が見つかりません: ${input.tripId}`);
      if (input.dayId) {
        const day = await db.days.get(input.dayId);
        if (!day) throw new Error(`日付データが見つかりません: ${input.dayId}`);
        if (day.tripId !== input.tripId) throw new Error('日付データが別の旅行に属しています');
      }
      if (input.placeId) {
        const place = await db.places.get(input.placeId);
        if (!place) throw new Error(`スポットが見つかりません: ${input.placeId}`);
        if (place.tripId !== input.tripId) throw new Error('スポットが別の旅行に属しています');
        if (input.dayId && place.dayId !== input.dayId)
          throw new Error('スポットと日付データが対応していません');
      }
      if (input.startAt && input.endAt && input.endAt < input.startAt)
        throw new Error('終了時刻は開始時刻以降にしてください');
      const now = nowIso();
      record = validateRecord(
        reservationRecordSchema,
        {
          id: createId(),
          tripId: input.tripId,
          dayId: input.dayId ?? null,
          placeId: input.placeId ?? null,
          kind: input.kind,
          title: input.title,
          startAt: input.startAt ?? null,
          endAt: input.endAt ?? null,
          location: input.location ?? '',
          confirmationCode: input.confirmationCode ?? '',
          url: input.url ?? '',
          phone: input.phone ?? '',
          memo: input.memo ?? '',
          isPrivate: input.isPrivate ?? false,
          createdAt: now,
          updatedAt: now,
        },
        '予約の追加',
      );
      await db.reservations.add(record);
      await touchTrip(input.tripId);
    });
    if (!record) throw new Error('予約の追加に失敗しました');
    return reservationFromRecord(record);
  },

  async update(id: string, patch: ReservationPatch): Promise<Reservation> {
    let record: ReservationRecord | undefined;
    await db.transaction('rw', db.trips, db.days, db.places, db.reservations, async () => {
      const existing = await db.reservations.get(id);
      if (!existing) throw new Error(`予約が見つかりません: ${id}`);
      const merged = { ...existing, ...patch, updatedAt: nowIso() };
      if (merged.dayId) {
        const day = await db.days.get(merged.dayId);
        if (!day) throw new Error(`日付データが見つかりません: ${merged.dayId}`);
        if (day.tripId !== merged.tripId) throw new Error('日付データが別の旅行に属しています');
      }
      if (merged.placeId) {
        const place = await db.places.get(merged.placeId);
        if (!place) throw new Error(`スポットが見つかりません: ${merged.placeId}`);
        if (place.tripId !== merged.tripId) throw new Error('スポットが別の旅行に属しています');
        if (merged.dayId && place.dayId !== merged.dayId)
          throw new Error('スポットと日付データが対応していません');
      }
      if (merged.startAt && merged.endAt && merged.endAt < merged.startAt)
        throw new Error('終了時刻は開始時刻以降にしてください');
      record = validateRecord(reservationRecordSchema, merged, '予約の更新');
      await db.reservations.put(record);
      await touchTrip(record.tripId);
    });
    if (!record) throw new Error('予約の更新に失敗しました');
    return reservationFromRecord(record);
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.trips, db.reservations, async () => {
      const existing = await db.reservations.get(id);
      if (!existing) return;
      await db.reservations.delete(id);
      await touchTrip(existing.tripId);
    });
  },
};
