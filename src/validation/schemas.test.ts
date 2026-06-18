import { describe, expect, it } from 'vitest';
import type { PlaceRecord } from '@/db/records';
import { PLACE_ADDRESS_MAX_LENGTH } from '@/domain/types';
import { MAX_TRIP_DAYS, placeRecordSchema, tripFormSchema, tripRecordSchema } from './schemas';

describe('tripFormSchema', () => {
  const base = {
    title: '京都',
    description: '',
    startDate: '2026-07-01',
    endDate: '2026-07-03',
  };

  it('accepts a valid trip and trims the title', () => {
    const result = tripFormSchema.safeParse({ ...base, title: '  京都  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe('京都');
  });

  it('rejects an empty title', () => {
    expect(tripFormSchema.safeParse({ ...base, title: '   ' }).success).toBe(false);
  });

  it('rejects an end date before the start date', () => {
    const result = tripFormSchema.safeParse({
      ...base,
      startDate: '2026-07-05',
      endDate: '2026-07-01',
    });
    expect(result.success).toBe(false);
  });

  it(`rejects a range longer than ${MAX_TRIP_DAYS} days`, () => {
    const result = tripFormSchema.safeParse({
      ...base,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(result.success).toBe(false);
  });
});

describe('placeRecordSchema (rejects corrupt persistence data)', () => {
  const valid: PlaceRecord = {
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
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
  };

  it('accepts a valid record', () => {
    expect(placeRecordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an out-of-range latitude', () => {
    expect(placeRecordSchema.safeParse({ ...valid, latitude: 999 }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(placeRecordSchema.safeParse({ ...valid, category: 'spa' }).success).toBe(false);
  });

  it('rejects a non-http(s) URL', () => {
    expect(placeRecordSchema.safeParse({ ...valid, url: 'ftp://example.com' }).success).toBe(false);
  });

  it('rejects a negative cost', () => {
    expect(placeRecordSchema.safeParse({ ...valid, estimatedCost: -100 }).success).toBe(false);
  });

  it('rejects an invalid start time', () => {
    expect(placeRecordSchema.safeParse({ ...valid, startTime: '25:00' }).success).toBe(false);
  });

  it('accepts an empty URL (no link)', () => {
    expect(placeRecordSchema.safeParse({ ...valid, url: '' }).success).toBe(true);
  });

  it('normalises a legacy travelMinutes-only record to manual', () => {
    const result = placeRecordSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.travelEstimateSource).toBe('manual');
  });

  it('rejects incomplete auto travel metadata', () => {
    const result = placeRecordSchema.safeParse({
      ...valid,
      travelMinutes: 15,
      travelEstimateSource: 'auto',
      travelMode: 'walk',
      travelDistanceMeters: null,
      travelToPlaceId: 'p2',
      travelRouteKey: '35.00000,135.00000,35.10000,135.10000,walk',
      travelCalculatedAt: '2026-06-16T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects manual travel time mixed with auto metadata', () => {
    const result = placeRecordSchema.safeParse({
      ...valid,
      travelEstimateSource: 'manual',
      travelDistanceMeters: 1000,
    });
    expect(result.success).toBe(false);
  });
});

describe('placeRecordSchema address (backward compatible, normalised)', () => {
  // A v1-style record (the JSON-backup unit) that predates the address field.
  const v1Record = {
    id: 'p1',
    tripId: 't1',
    dayId: 'd1',
    name: '清水寺',
    category: 'sightseeing' as const,
    latitude: 34.9948,
    longitude: 135.785,
    startTime: '09:30',
    stayMinutes: 90,
    travelMinutes: 15,
    memo: '',
    url: '',
    estimatedCost: 400,
    order: 0,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
  };

  it('loads a record with no address field (v1 backward compatibility) as null', () => {
    const result = placeRecordSchema.safeParse(v1Record);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBeNull();
  });

  it('survives a JSON round-trip of a v1 backup (missing address → null)', () => {
    const roundTripped = JSON.parse(JSON.stringify(v1Record)) as unknown;
    const result = placeRecordSchema.safeParse(roundTripped);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBeNull();
  });

  it('keeps a provided address', () => {
    const result = placeRecordSchema.safeParse({ ...v1Record, address: '東京都千代田区' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBe('東京都千代田区');
  });

  it('normalises a whitespace-only address to null', () => {
    const result = placeRecordSchema.safeParse({ ...v1Record, address: '   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBeNull();
  });

  it('trims surrounding whitespace from an address', () => {
    const result = placeRecordSchema.safeParse({ ...v1Record, address: '  東京駅  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBe('東京駅');
  });

  it('accepts an explicit null address', () => {
    const result = placeRecordSchema.safeParse({ ...v1Record, address: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBeNull();
  });

  it(`rejects an address longer than ${PLACE_ADDRESS_MAX_LENGTH} characters`, () => {
    const tooLong = 'あ'.repeat(PLACE_ADDRESS_MAX_LENGTH + 1);
    expect(placeRecordSchema.safeParse({ ...v1Record, address: tooLong }).success).toBe(false);
  });
});

describe('tripRecordSchema', () => {
  const valid = {
    id: 't1',
    title: '京都',
    description: '',
    startDate: '2026-07-01',
    endDate: '2026-07-03',
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
    schemaVersion: 1,
  };

  it('accepts a valid record', () => {
    expect(tripRecordSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    expect(
      tripRecordSchema.safeParse({ ...valid, startDate: '2026-07-05', endDate: '2026-07-01' })
        .success,
    ).toBe(false);
  });
});
