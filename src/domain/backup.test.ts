import { describe, expect, it } from 'vitest';
import type { PlaceRecord, TripDayRecord, TripRecord } from '@/db/records';
import {
  BackupError,
  MAX_BACKUP_BYTES,
  buildBackup,
  parseBackup,
  safeBackupFilename,
} from './backup';

const ISO = '2026-06-16T00:00:00.000Z';

const trip: TripRecord = {
  id: 't1',
  title: '京都旅行',
  description: '紅葉めぐり',
  startDate: '2026-07-01',
  endDate: '2026-07-02',
  createdAt: ISO,
  updatedAt: ISO,
  schemaVersion: 1,
};

const days: TripDayRecord[] = [
  { id: 'd1', tripId: 't1', date: '2026-07-01', order: 0 },
  { id: 'd2', tripId: 't1', date: '2026-07-02', order: 1 },
];

const places: PlaceRecord[] = [
  {
    id: 'p1',
    tripId: 't1',
    dayId: 'd1',
    name: '清水寺',
    category: 'sightseeing',
    latitude: 34.9948,
    longitude: 135.785,
    startTime: '09:30',
    stayMinutes: 90,
    travelMinutes: 15,
    memo: '',
    url: 'https://example.com',
    estimatedCost: 400,
    order: 0,
    createdAt: ISO,
    updatedAt: ISO,
  },
];

function validText(): string {
  return JSON.stringify(buildBackup(trip, days, places));
}

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    const backup = parseBackup(validText());
    expect(backup.trip.id).toBe('t1');
    expect(backup.days).toHaveLength(2);
    expect(backup.places[0].name).toBe('清水寺');
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('{ not json')).toThrow(BackupError);
  });

  it('rejects an unknown format', () => {
    const text = JSON.stringify({ ...buildBackup(trip, days, places), format: 'something-else' });
    expect(() => parseBackup(text)).toThrow(/対応していないバックアップ形式/);
  });

  it('rejects an unsupported version', () => {
    const text = JSON.stringify({ ...buildBackup(trip, days, places), version: 2 });
    expect(() => parseBackup(text)).toThrow(/バージョン/);
  });

  it('rejects data that fails schema validation', () => {
    const broken = buildBackup(trip, days, [{ ...places[0], latitude: 999 }]);
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(BackupError);
  });

  it('rejects a place that references a missing day', () => {
    const broken = buildBackup(trip, days, [{ ...places[0], dayId: 'ghost' }]);
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/日付データ/);
  });

  it('rejects a file larger than the size limit', () => {
    const huge = 'x'.repeat(MAX_BACKUP_BYTES + 1);
    expect(() => parseBackup(huge)).toThrow(/サイズ/);
  });
});

describe('safeBackupFilename', () => {
  it('keeps Japanese, strips unsafe characters, and adds the date', () => {
    const name = safeBackupFilename('京都/旅行:2日 *メモ*', ISO);
    expect(name).toBe('tabiori_京都旅行2日_メモ_2026-06-16.json');
  });

  it('falls back to a generic name when nothing usable remains', () => {
    expect(safeBackupFilename('///', ISO)).toBe('tabiori_trip_2026-06-16.json');
  });
});
