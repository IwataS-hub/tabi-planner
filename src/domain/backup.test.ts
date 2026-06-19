import { describe, expect, it } from 'vitest';
import type {
  ChecklistItemRecord,
  ExpenseRecord,
  ExpenseShareRecord,
  ParticipantRecord,
  PlaceRecord,
  TripDayRecord,
  TripRecord,
} from '@/db/records';
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
  budgetYen: null,
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
    address: '京都府京都市東山区清水1丁目294',
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    travelToPlaceId: null,
    travelRouteKey: null,
    travelCalculatedAt: null,
    startTime: '09:30',
    stayMinutes: 90,
    travelMinutes: 15,
    memo: '',
    url: 'https://example.com',
    estimatedCost: 400,
    visitStatus: null,
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

  it('rejects day records that do not match the trip date range', () => {
    const broken = buildBackup(trip, [days[0]], places);
    expect(() => parseBackup(JSON.stringify(broken))).toThrow(/旅行期間/);
  });

  it('rejects a file larger than the size limit', () => {
    const huge = 'x'.repeat(MAX_BACKUP_BYTES + 1);
    expect(() => parseBackup(huge)).toThrow(/サイズ/);
  });

  // --- Phase 2.1 address compatibility (format/version 1 is unchanged) ----

  it('includes address in a newly exported backup', () => {
    const backup = parseBackup(validText());
    expect(backup.version).toBe(1);
    expect(backup.places[0].address).toBe('京都府京都市東山区清水1丁目294');
  });

  it('reads an old version 1 backup whose places have no address (→ null)', () => {
    // Simulate a backup written before the address field existed.
    const legacy = buildBackup(trip, days, places) as unknown as Record<string, unknown>;
    legacy.places = (legacy.places as Record<string, unknown>[]).map((place) => {
      const { address: _omit, ...rest } = place;
      return rest;
    });
    const backup = parseBackup(JSON.stringify(legacy));
    expect(backup.places[0].address).toBeNull();
  });

  it('normalises a whitespace-only address to null on import', () => {
    const backup = buildBackup(trip, days, [{ ...places[0], address: '   ' }]);
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.places[0].address).toBeNull();
  });
});

describe('Phase 2.3 new entities in backup', () => {
  const ISO = '2026-06-16T00:00:00.000Z';

  const participant: ParticipantRecord = {
    id: 'part1',
    tripId: 't1',
    name: 'Alice',
    order: 0,
    createdAt: ISO,
    updatedAt: ISO,
  };

  const expense: ExpenseRecord = {
    id: 'exp1',
    tripId: 't1',
    dayId: null,
    placeId: null,
    payerId: 'part1',
    title: 'Dinner',
    amountYen: 3000,
    category: 'food',
    occurredAt: null,
    memo: '',
    createdAt: ISO,
    updatedAt: ISO,
  };

  const expenseShare: ExpenseShareRecord = {
    id: 'share1',
    expenseId: 'exp1',
    participantId: 'part1',
    amountYen: 3000,
  };

  const checklistItem: ChecklistItemRecord = {
    id: 'ci1',
    tripId: 't1',
    kind: 'packing',
    title: '折りたたみ傘',
    category: '天気対策',
    completed: false,
    assigneeId: null,
    dueAt: null,
    order: 0,
    createdAt: ISO,
    updatedAt: ISO,
  };

  it('round-trips participants, expenses, shares, and checklist items', () => {
    const backup = buildBackup(
      trip,
      days,
      places,
      [participant],
      [expense],
      [expenseShare],
      [checklistItem],
    );
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.participants).toHaveLength(1);
    expect(parsed.participants[0].name).toBe('Alice');
    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.expenses[0].title).toBe('Dinner');
    expect(parsed.expenseShares).toHaveLength(1);
    expect(parsed.expenseShares[0].amountYen).toBe(3000);
    expect(parsed.checklistItems).toHaveLength(1);
    expect(parsed.checklistItems[0].title).toBe('折りたたみ傘');
  });

  it('defaults new entity arrays to [] when absent (legacy v1 backward compat)', () => {
    const legacy = buildBackup(trip, days, places) as unknown as Record<string, unknown>;
    delete legacy.participants;
    delete legacy.expenses;
    delete legacy.expenseShares;
    delete legacy.checklistItems;
    const parsed = parseBackup(JSON.stringify(legacy));
    expect(parsed.participants).toHaveLength(0);
    expect(parsed.expenses).toHaveLength(0);
    expect(parsed.expenseShares).toHaveLength(0);
    expect(parsed.checklistItems).toHaveLength(0);
  });

  it('rejects an expense whose payerId does not match any participant', () => {
    const badExpense: ExpenseRecord = { ...expense, payerId: 'ghost' };
    const backup = buildBackup(trip, days, places, [participant], [badExpense], [expenseShare], []);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError);
  });

  it('rejects a share whose expenseId does not exist', () => {
    const badShare = { ...expenseShare, expenseId: 'ghost' };
    const backup = buildBackup(trip, days, places, [participant], [expense], [badShare], []);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError);
  });

  it('rejects a share whose participantId does not exist', () => {
    const badShare = { ...expenseShare, participantId: 'ghost' };
    const backup = buildBackup(trip, days, places, [participant], [expense], [badShare], []);
    expect(() => parseBackup(JSON.stringify(backup))).toThrow(BackupError);
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
