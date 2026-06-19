import { z } from 'zod';
import {
  candidatePlaceRecordSchema,
  checklistItemRecordSchema,
  expenseRecordSchema,
  expenseShareRecordSchema,
  participantRecordSchema,
  placeRecordSchema,
  reservationRecordSchema,
  tripDayRecordSchema,
  tripRecordSchema,
} from '@/validation/schemas';
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
} from '@/db/records';
import { eachDateInRange, toISODate } from '@/lib/date';

export const BACKUP_FORMAT = 'tabiori-trip-backup';
export const BACKUP_VERSION = 1;

/** Maximum accepted import size (~2MB). */
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export const tripBackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'exportedAt が不正です'),
  trip: tripRecordSchema,
  days: z.array(tripDayRecordSchema),
  places: z.array(placeRecordSchema),
  // Phase 2.3: optional arrays — default to [] for v1 backups without them
  participants: z.array(participantRecordSchema).optional().default([]),
  expenses: z.array(expenseRecordSchema).optional().default([]),
  expenseShares: z.array(expenseShareRecordSchema).optional().default([]),
  checklistItems: z.array(checklistItemRecordSchema).optional().default([]),
  // Phase 2.4: optional arrays — default to [] for older backups
  candidatePlaces: z.array(candidatePlaceRecordSchema).optional().default([]),
  reservations: z.array(reservationRecordSchema).optional().default([]),
});

export type TripBackup = z.infer<typeof tripBackupSchema>;

/** Raised on any import problem; carries a Japanese, user-facing message. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function buildBackup(
  trip: TripRecord,
  days: TripDayRecord[],
  places: PlaceRecord[],
  participants: ParticipantRecord[] = [],
  expenses: ExpenseRecord[] = [],
  expenseShares: ExpenseShareRecord[] = [],
  checklistItems: ChecklistItemRecord[] = [],
  candidatePlaces: CandidatePlaceRecord[] = [],
  reservations: ReservationRecord[] = [],
): TripBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    trip,
    days,
    places,
    participants,
    expenses,
    expenseShares,
    checklistItems,
    candidatePlaces,
    reservations,
  };
}

export function safeBackupFilename(title: string, exportedAtIso: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 40);
  const safeTitle = cleaned || 'trip';
  const parsed = new Date(exportedAtIso);
  const date = Number.isNaN(parsed.getTime()) ? toISODate(new Date()) : toISODate(parsed);
  return `tabiori_${safeTitle}_${date}.json`;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function parseBackup(text: string): TripBackup {
  if (byteLength(text) > MAX_BACKUP_BYTES) {
    throw new BackupError('ファイルサイズが大きすぎます（上限は約2MBです）。');
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError('JSONとして読み込めませんでした。ファイルが壊れている可能性があります。');
  }

  if (typeof json !== 'object' || json === null) {
    throw new BackupError('バックアップの形式が正しくありません。');
  }
  const envelope = json as Record<string, unknown>;
  if (envelope.format !== BACKUP_FORMAT) {
    throw new BackupError(
      '対応していないバックアップ形式です。Tabiori で書き出したファイルを選んでください。',
    );
  }
  if (envelope.version !== BACKUP_VERSION) {
    throw new BackupError(
      `対応していないバックアップのバージョンです（version: ${String(envelope.version)}）。`,
    );
  }

  const result = tripBackupSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.map(String).join('.') || '(root)';
    throw new BackupError(`バックアップの内容に問題があります（${path}: ${first?.message}）。`);
  }

  const backup = result.data;
  assertReferentialIntegrity(backup);
  return backup;
}

/** Verify trip/day/place/participant/expense ids are internally consistent. */
export function assertReferentialIntegrity(backup: TripBackup): void {
  const dayIds = new Set(backup.days.map((day) => day.id));
  if (dayIds.size !== backup.days.length) {
    throw new BackupError('バックアップ内に日付データの重複があります。');
  }
  const expectedDates = eachDateInRange(backup.trip.startDate, backup.trip.endDate);
  const actualDates = new Set(backup.days.map((day) => day.date));
  if (
    actualDates.size !== backup.days.length ||
    actualDates.size !== expectedDates.length ||
    expectedDates.some((date) => !actualDates.has(date))
  ) {
    throw new BackupError('日付データが旅行期間と対応していません。');
  }
  for (const day of backup.days) {
    if (day.tripId !== backup.trip.id) {
      throw new BackupError('日付データが旅行と対応していません。');
    }
  }
  for (const place of backup.places) {
    if (place.tripId !== backup.trip.id) {
      throw new BackupError('スポットが旅行と対応していません。');
    }
    if (!dayIds.has(place.dayId)) {
      throw new BackupError('スポットが参照する日付データが見つかりません。');
    }
  }

  // Phase 2.3 referential integrity
  const placeIds = new Set(backup.places.map((p) => p.id));
  const participantIds = new Set(backup.participants.map((p) => p.id));
  const expenseIds = new Set(backup.expenses.map((e) => e.id));

  for (const p of backup.participants) {
    if (p.tripId !== backup.trip.id) {
      throw new BackupError('参加者データが旅行と対応していません。');
    }
  }
  for (const e of backup.expenses) {
    if (e.tripId !== backup.trip.id) {
      throw new BackupError('費用データが旅行と対応していません。');
    }
    if (e.dayId != null && !dayIds.has(e.dayId)) {
      throw new BackupError('費用データが参照する日付データが見つかりません。');
    }
    if (e.placeId != null && !placeIds.has(e.placeId)) {
      throw new BackupError('費用データが参照するスポットが見つかりません。');
    }
    if (!participantIds.has(e.payerId)) {
      throw new BackupError('費用の支払者が参加者として見つかりません。');
    }
  }
  for (const s of backup.expenseShares) {
    if (!expenseIds.has(s.expenseId)) {
      throw new BackupError('費用分担データが参照する費用が見つかりません。');
    }
    if (!participantIds.has(s.participantId)) {
      throw new BackupError('費用分担データが参照する参加者が見つかりません。');
    }
  }
  // Validate share totals
  const shareSumByExpense = new Map<string, number>();
  for (const s of backup.expenseShares) {
    shareSumByExpense.set(s.expenseId, (shareSumByExpense.get(s.expenseId) ?? 0) + s.amountYen);
  }
  for (const e of backup.expenses) {
    const shareTotal = shareSumByExpense.get(e.id) ?? 0;
    if (shareTotal !== e.amountYen) {
      throw new BackupError(
        `費用「${e.title}」の分担合計（${shareTotal}円）が費用額（${e.amountYen}円）と一致しません。`,
      );
    }
  }
  for (const item of backup.checklistItems) {
    if (item.tripId !== backup.trip.id) {
      throw new BackupError('チェックリスト項目が旅行と対応していません。');
    }
    if (item.assigneeId != null && !participantIds.has(item.assigneeId)) {
      throw new BackupError('チェックリスト項目が参照する参加者が見つかりません。');
    }
  }

  // Phase 2.4 referential integrity
  for (const c of backup.candidatePlaces) {
    if (c.tripId !== backup.trip.id) {
      throw new BackupError('候補スポットが旅行と対応していません。');
    }
  }
  for (const r of backup.reservations) {
    if (r.tripId !== backup.trip.id) {
      throw new BackupError('予約データが旅行と対応していません。');
    }
    if (r.dayId != null && !dayIds.has(r.dayId)) {
      throw new BackupError('予約データが参照する日付データが見つかりません。');
    }
    if (r.placeId != null && !placeIds.has(r.placeId)) {
      throw new BackupError('予約データが参照するスポットが見つかりません。');
    }
  }
}
