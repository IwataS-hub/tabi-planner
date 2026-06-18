import { db } from '@/db/database';
import { dayFromRecord, tripFromRecord } from '@/db/mappers';
import type {
  ChecklistItemRecord,
  ExpenseRecord,
  ExpenseShareRecord,
  ParticipantRecord,
  PlaceRecord,
  TripDayRecord,
  TripRecord,
} from '@/db/records';
import { CURRENT_SCHEMA_VERSION, type Trip, type TripDay } from '@/domain/types';
import { buildBackup, type TripBackup } from '@/domain/backup';
import { eachDateInRange } from '@/lib/date';
import { createId } from '@/lib/utils';
import { reconcileAutoTravelInDay } from './placeRepository';
import {
  checklistItemRecordSchema,
  expenseRecordSchema,
  expenseShareRecordSchema,
  participantRecordSchema,
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

function compareDaysByDate(a: TripDayRecord, b: TripDayRecord): number {
  return a.date.localeCompare(b.date) || a.order - b.order || a.id.localeCompare(b.id);
}

function comparePlacesWithinDay(a: PlaceRecord, b: PlaceRecord): number {
  return a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

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
    const removedIds = removedDays.map((day) => day.id);
    await db.places.where('dayId').anyOf(removedIds).delete();
    await db.days.bulkDelete(removedIds);
  }
  await db.days.bulkPut(nextDays);
}

export const tripRepository = {
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
        budgetYen: null,
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

  async updateDetails(id: string, draft: TripDraft & { budgetYen?: number | null }): Promise<Trip> {
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
          budgetYen: 'budgetYen' in draft ? (draft.budgetYen ?? null) : current.budgetYen,
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
      budgetYen: null,
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
          visitStatus: null,
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
    await db.transaction(
      'rw',
      [db.trips, db.days, db.places, db.participants, db.expenses, db.expenseShares, db.checklistItems],
      async () => {
        // Delete expense shares for all expenses in this trip
        const expenses = await db.expenses.where('tripId').equals(id).toArray();
        const expenseIds = expenses.map((e) => e.id);
        if (expenseIds.length > 0) {
          await db.expenseShares.where('expenseId').anyOf(expenseIds).delete();
        }
        await db.expenses.where('tripId').equals(id).delete();
        await db.participants.where('tripId').equals(id).delete();
        await db.checklistItems.where('tripId').equals(id).delete();
        await db.places.where('tripId').equals(id).delete();
        await db.days.where('tripId').equals(id).delete();
        await db.trips.delete(id);
      },
    );
  },

  async listDays(tripId: string): Promise<TripDay[]> {
    const records = await db.days.where('tripId').equals(tripId).sortBy('order');
    return records.map((record) =>
      dayFromRecord(validateRecord(tripDayRecordSchema, record, '日付データ')),
    );
  },

  async exportTrip(id: string): Promise<TripBackup> {
    const tripRecord = await db.trips.get(id);
    if (!tripRecord) throw new Error(`旅行が見つかりません: ${id}`);
    const trip = validateRecord(tripRecordSchema, tripRecord, '旅行データ');
    const days = (await db.days.where('tripId').equals(id).toArray())
      .map((day) => validateRecord(tripDayRecordSchema, day, '日付データ'))
      .sort(compareDaysByDate);
    const dayOrder = new Map(days.map((day, index) => [day.id, index]));
    const places = (await db.places.where('tripId').equals(id).toArray())
      .map((place) => validateRecord(placeRecordSchema, place, 'スポットデータ'))
      .sort((a, b) => {
        const dayDelta = (dayOrder.get(a.dayId) ?? Infinity) - (dayOrder.get(b.dayId) ?? Infinity);
        return dayDelta !== 0 ? dayDelta : comparePlacesWithinDay(a, b);
      });
    const participants = (await db.participants.where('tripId').equals(id).sortBy('order')).map(
      (p) => validateRecord(participantRecordSchema, p, '参加者データ'),
    );
    const expenses = (await db.expenses.where('tripId').equals(id).toArray()).map((e) =>
      validateRecord(expenseRecordSchema, e, '費用データ'),
    );
    const expenseIds = expenses.map((e) => e.id);
    const expenseShares =
      expenseIds.length > 0
        ? (await db.expenseShares.where('expenseId').anyOf(expenseIds).toArray()).map((s) =>
            validateRecord(expenseShareRecordSchema, s, '費用分担データ'),
          )
        : [];
    const checklistItems = (
      await db.checklistItems.where('tripId').equals(id).sortBy('order')
    ).map((item) => validateRecord(checklistItemRecordSchema, item, 'チェックリストデータ'));

    return buildBackup(trip, days, places, participants, expenses, expenseShares, checklistItems);
  },

  async importBackup(backup: TripBackup): Promise<Trip> {
    const now = nowIso();
    const newTripId = createId();
    const dayIdMap = new Map<string, string>();
    const placeIdMap = new Map<string, string>();
    const participantIdMap = new Map<string, string>();
    const expenseIdMap = new Map<string, string>();

    let savedTrip: TripRecord | undefined;
    await db.transaction(
      'rw',
      [db.trips, db.days, db.places, db.participants, db.expenses, db.expenseShares, db.checklistItems],
      async () => {
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

        const orderedDays = [...backup.days].sort(compareDaysByDate);
        const placesByDay = new Map<string, PlaceRecord[]>();
        for (const place of backup.places) {
          const dayPlaces = placesByDay.get(place.dayId) ?? [];
          dayPlaces.push(place);
          placesByDay.set(place.dayId, dayPlaces);
        }

        const newDays: TripDayRecord[] = orderedDays.map((day, index) => {
          const newId = createId();
          dayIdMap.set(day.id, newId);
          return validateRecord(
            tripDayRecordSchema,
            { ...day, id: newId, tripId: newTripId, order: index },
            '日付データの読み込み',
          );
        });

        for (const place of backup.places) placeIdMap.set(place.id, createId());

        const newPlaces: PlaceRecord[] = orderedDays.flatMap((day) =>
          (placesByDay.get(day.id) ?? []).sort(comparePlacesWithinDay).map((place, index) => {
            const dayId = dayIdMap.get(place.dayId);
            if (!dayId) {
              throw new Error(`スポットが参照する日付データが見つかりません: ${place.id}`);
            }
            const newId = placeIdMap.get(place.id) ?? createId();
            const mappedTarget = place.travelToPlaceId
              ? (placeIdMap.get(place.travelToPlaceId) ?? null)
              : null;
            const travelFields =
              place.travelEstimateSource === 'auto' && mappedTarget
                ? { travelToPlaceId: mappedTarget }
                : place.travelEstimateSource === 'auto'
                  ? {
                      travelMinutes: null,
                      travelMode: null,
                      travelDistanceMeters: null,
                      travelEstimateSource: null,
                      travelToPlaceId: null,
                      travelRouteKey: null,
                      travelCalculatedAt: null,
                    }
                  : {
                      travelMode: null,
                      travelDistanceMeters: null,
                      travelToPlaceId: null,
                      travelRouteKey: null,
                      travelCalculatedAt: null,
                    };
            return validateRecord(
              placeRecordSchema,
              {
                ...place,
                id: newId,
                tripId: newTripId,
                dayId,
                order: index,
                ...travelFields,
                createdAt: now,
                updatedAt: now,
              },
              'スポットの読み込み',
            );
          }),
        );

        // Participants
        const orderedParticipants = [...backup.participants].sort(
          (a, b) => a.order - b.order || a.id.localeCompare(b.id),
        );
        const newParticipants: ParticipantRecord[] = orderedParticipants.map((p, index) => {
          const newId = createId();
          participantIdMap.set(p.id, newId);
          return validateRecord(
            participantRecordSchema,
            { ...p, id: newId, tripId: newTripId, order: index, createdAt: now, updatedAt: now },
            '参加者の読み込み',
          );
        });

        // Expenses
        const newExpenses: ExpenseRecord[] = [];
        for (const e of backup.expenses) {
          const newId = createId();
          expenseIdMap.set(e.id, newId);
          const newPayerId = participantIdMap.get(e.payerId);
          if (!newPayerId) throw new Error(`費用の支払者が見つかりません: ${e.payerId}`);
          const newDayId = e.dayId ? (dayIdMap.get(e.dayId) ?? null) : null;
          const newPlaceId = e.placeId ? (placeIdMap.get(e.placeId) ?? null) : null;
          newExpenses.push(
            validateRecord(
              expenseRecordSchema,
              {
                ...e,
                id: newId,
                tripId: newTripId,
                dayId: newDayId,
                placeId: newPlaceId,
                payerId: newPayerId,
                createdAt: now,
                updatedAt: now,
              },
              '費用の読み込み',
            ),
          );
        }

        // Expense shares
        const newShares: ExpenseShareRecord[] = [];
        for (const s of backup.expenseShares) {
          const newExpenseId = expenseIdMap.get(s.expenseId);
          const newParticipantId = participantIdMap.get(s.participantId);
          if (!newExpenseId || !newParticipantId) continue; // skip orphaned shares
          newShares.push(
            validateRecord(
              expenseShareRecordSchema,
              { id: createId(), expenseId: newExpenseId, participantId: newParticipantId, amountYen: s.amountYen },
              '費用分担の読み込み',
            ),
          );
        }

        // Checklist items
        const orderedItems = [...backup.checklistItems].sort(
          (a, b) => a.order - b.order || a.id.localeCompare(b.id),
        );
        const newChecklistItems: ChecklistItemRecord[] = orderedItems.map((item, index) => {
          const newAssigneeId = item.assigneeId
            ? (participantIdMap.get(item.assigneeId) ?? null)
            : null;
          return validateRecord(
            checklistItemRecordSchema,
            {
              ...item,
              id: createId(),
              tripId: newTripId,
              assigneeId: newAssigneeId,
              order: index,
              createdAt: now,
              updatedAt: now,
            },
            'チェックリストの読み込み',
          );
        });

        await db.trips.add(newTrip);
        await db.days.bulkAdd(newDays);
        if (newPlaces.length > 0) await db.places.bulkAdd(newPlaces);
        if (newParticipants.length > 0) await db.participants.bulkAdd(newParticipants);
        if (newExpenses.length > 0) await db.expenses.bulkAdd(newExpenses);
        if (newShares.length > 0) await db.expenseShares.bulkAdd(newShares);
        if (newChecklistItems.length > 0) await db.checklistItems.bulkAdd(newChecklistItems);
        for (const day of newDays) await reconcileAutoTravelInDay(day.id);
        savedTrip = newTrip;
      },
    );

    if (!savedTrip) throw new Error('旅行の読み込みに失敗しました');
    return tripFromRecord(savedTrip);
  },
};
