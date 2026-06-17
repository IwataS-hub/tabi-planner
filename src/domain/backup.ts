import { z } from 'zod';
import { placeRecordSchema, tripDayRecordSchema, tripRecordSchema } from '@/validation/schemas';
import type { PlaceRecord, TripDayRecord, TripRecord } from '@/db/records';
import { toISODate } from '@/lib/date';

/**
 * Single-trip backup format. A backup is fully self-contained (trip + its days
 * + its places) and carries a format tag and version so future readers can
 * detect and reject incompatible files. It must contain no secrets or
 * browser-specific data — only the records the user created.
 */
export const BACKUP_FORMAT = 'tabiori-trip-backup';
export const BACKUP_VERSION = 1;

/** Maximum accepted import size (Phase 1.2: ~2MB). */
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
): TripBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    trip,
    days,
    places,
  };
}

/**
 * Build a safe download filename like `tabiori_京都旅行_2026-06-16.json`.
 * Removes characters that are illegal/unsafe in filenames across platforms
 * while keeping Japanese text; whitespace becomes an underscore. Falls back to
 * a generic name when nothing usable remains.
 */
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

/**
 * Parse and validate backup text into a typed TripBackup, or throw a
 * BackupError with a Japanese reason. Pure (no DB access) so it is fully
 * unit-testable. Checks, in order: size, JSON validity, format/version,
 * full Zod schema, then referential integrity between trip/days/places.
 */
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

/** Verify trip/day/place ids are internally consistent before importing. */
export function assertReferentialIntegrity(backup: TripBackup): void {
  const dayIds = new Set(backup.days.map((day) => day.id));
  if (dayIds.size !== backup.days.length) {
    throw new BackupError('バックアップ内に日付データの重複があります。');
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
}
