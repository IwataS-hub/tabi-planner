import { beforeEach, describe, expect, it } from 'vitest';
import { db, TabioriDatabase } from '@/db/database';
import { placeToRecord } from '@/db/mappers';
import type { PlaceRecord } from '@/db/records';
import type { Place } from '@/domain/types';
import { DEFAULT_PLACE_NAME, placeRepository, reverseGeocodePatch } from './placeRepository';
import { tripRepository } from './tripRepository';

async function seed() {
  const trip = await tripRepository.create({
    title: 'テスト旅行',
    description: '',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
  });
  const days = await tripRepository.listDays(trip.id);
  return { tripId: trip.id, dayId: days[0].id };
}

function coords(n: number) {
  return { latitude: 35 + n * 0.01, longitude: 135 + n * 0.01 };
}

beforeEach(async () => {
  await Promise.all([db.trips.clear(), db.days.clear(), db.places.clear()]);
});

describe('placeRepository.add', () => {
  it('uses the default name and assigns incrementing order', async () => {
    const { tripId, dayId } = await seed();
    const a = await placeRepository.add({ tripId, dayId, ...coords(0) });
    const b = await placeRepository.add({ tripId, dayId, ...coords(1) });

    expect(a.name).toBe(DEFAULT_PLACE_NAME);
    expect(a.category).toBe('sightseeing');
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
  });

  it('keeps order unique when spots are added concurrently', async () => {
    const { tripId, dayId } = await seed();

    await Promise.all([
      placeRepository.add({ tripId, dayId, ...coords(0) }),
      placeRepository.add({ tripId, dayId, ...coords(1) }),
      placeRepository.add({ tripId, dayId, ...coords(2) }),
    ]);

    const list = await placeRepository.listByDay(dayId);
    expect(list.map((p) => p.order)).toEqual([0, 1, 2]);
  });

  it('rejects a day that belongs to a different trip', async () => {
    const first = await seed();
    const second = await seed();

    await expect(
      placeRepository.add({ tripId: first.tripId, dayId: second.dayId, ...coords(0) }),
    ).rejects.toThrow('一致しません');

    expect(await placeRepository.listByTrip(first.tripId)).toHaveLength(0);
    expect(await placeRepository.listByTrip(second.tripId)).toHaveLength(0);
  });

  it('bumps the parent trip updatedAt', async () => {
    const { tripId, dayId } = await seed();
    const before = await tripRepository.get(tripId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await placeRepository.add({ tripId, dayId, ...coords(0) });
    const after = await tripRepository.get(tripId);
    expect(after!.updatedAt >= before!.updatedAt).toBe(true);
  });
});

describe('placeRepository.update', () => {
  it('edits fields', async () => {
    const { tripId, dayId } = await seed();
    const place = await placeRepository.add({ tripId, dayId, ...coords(0) });

    const updated = await placeRepository.update(place.id, {
      name: '清水寺',
      category: 'food',
      startTime: '09:30',
      stayMinutes: 90,
      estimatedCost: 400,
      url: 'https://example.com',
      memo: '紅葉',
    });

    expect(updated.name).toBe('清水寺');
    expect(updated.category).toBe('food');
    expect(updated.startTime).toBe('09:30');
    expect(updated.stayMinutes).toBe(90);
    expect(updated.estimatedCost).toBe(400);
    expect(updated.memo).toBe('紅葉');
  });

  it('preserves independent fields when updates overlap', async () => {
    const { tripId, dayId } = await seed();
    const place = await placeRepository.add({ tripId, dayId, name: '元の名前', ...coords(0) });

    await Promise.all([
      placeRepository.update(place.id, { name: '清水寺' }),
      placeRepository.update(place.id, { memo: '夕方に行く' }),
    ]);

    const [updated] = await placeRepository.listByDay(dayId);
    expect(updated.name).toBe('清水寺');
    expect(updated.memo).toBe('夕方に行く');
  });
});

describe('placeRepository.remove', () => {
  it('deletes and re-packs the remaining order', async () => {
    const { tripId, dayId } = await seed();
    const a = await placeRepository.add({ tripId, dayId, ...coords(0) });
    const b = await placeRepository.add({ tripId, dayId, ...coords(1) });
    const c = await placeRepository.add({ tripId, dayId, ...coords(2) });

    await placeRepository.remove(b.id);

    const list = await placeRepository.listByDay(dayId);
    expect(list.map((p) => p.id)).toEqual([a.id, c.id]);
    expect(list.map((p) => p.order)).toEqual([0, 1]);
  });
});

describe('placeRepository.reorderWithinDay', () => {
  it('persists the new order as contiguous indices', async () => {
    const { tripId, dayId } = await seed();
    const a = await placeRepository.add({ tripId, dayId, ...coords(0) });
    const b = await placeRepository.add({ tripId, dayId, ...coords(1) });
    const c = await placeRepository.add({ tripId, dayId, ...coords(2) });

    await placeRepository.reorderWithinDay(dayId, [c.id, a.id, b.id]);

    const list = await placeRepository.listByDay(dayId);
    expect(list.map((p) => p.id)).toEqual([c.id, a.id, b.id]);
    expect(list.map((p) => p.order)).toEqual([0, 1, 2]);
  });
});

describe('placeRepository.duplicate', () => {
  it('clones directly after the original and shifts the rest', async () => {
    const { tripId, dayId } = await seed();
    const a = await placeRepository.add({ tripId, dayId, name: '金閣寺', ...coords(0) });
    const b = await placeRepository.add({ tripId, dayId, ...coords(1) });

    const copy = await placeRepository.duplicate(a.id);
    expect(copy.name).toBe('金閣寺のコピー');

    const list = await placeRepository.listByDay(dayId);
    expect(list.map((p) => p.id)).toEqual([a.id, copy.id, b.id]);
    expect(list.map((p) => p.order)).toEqual([0, 1, 2]);
  });
});

describe('persistence across a simulated reload', () => {
  it('restores trips and places from a fresh database connection', async () => {
    const { tripId, dayId } = await seed();
    await placeRepository.add({ tripId, dayId, name: '銀閣寺', ...coords(0) });

    // Open a brand-new connection to the same IndexedDB (as a page reload does).
    const fresh = new TabioriDatabase();
    await fresh.open();
    try {
      const trips = await fresh.trips.toArray();
      const places = await fresh.places.toArray();
      expect(trips).toHaveLength(1);
      expect(trips[0].id).toBe(tripId);
      expect(places).toHaveLength(1);
      expect(places[0].name).toBe('銀閣寺');
    } finally {
      fresh.close();
    }
  });
});

describe('place address persistence', () => {
  it('saves and restores an address provided on add', async () => {
    const { tripId, dayId } = await seed();
    const created = await placeRepository.add({
      tripId,
      dayId,
      name: '東京駅',
      address: '東京都千代田区丸の内1丁目',
      ...coords(0),
    });
    expect(created.address).toBe('東京都千代田区丸の内1丁目');

    const [restored] = await placeRepository.listByDay(dayId);
    expect(restored.address).toBe('東京都千代田区丸の内1丁目');
  });

  it('defaults address to null when omitted on add', async () => {
    const { tripId, dayId } = await seed();
    const created = await placeRepository.add({ tripId, dayId, ...coords(0) });
    expect(created.address).toBeNull();
  });

  it('normalises a whitespace-only address to null', async () => {
    const { tripId, dayId } = await seed();
    const created = await placeRepository.add({ tripId, dayId, address: '   ', ...coords(0) });
    expect(created.address).toBeNull();
  });

  it('restores legacy records that never had an address field as null', async () => {
    const { tripId, dayId } = await seed();
    // Insert a v1-style record (no address) directly, bypassing the add() path.
    await db.places.add({
      id: 'legacy',
      tripId,
      dayId,
      name: '旧データ',
      category: 'sightseeing',
      latitude: 35,
      longitude: 135,
      startTime: null,
      stayMinutes: null,
      travelMinutes: null,
      memo: '',
      url: '',
      estimatedCost: null,
      order: 0,
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    } as unknown as PlaceRecord);

    const [restored] = await placeRepository.listByDay(dayId);
    expect(restored.name).toBe('旧データ');
    expect(restored.address).toBeNull();
  });

  it('updates an address via patch', async () => {
    const { tripId, dayId } = await seed();
    const created = await placeRepository.add({ tripId, dayId, ...coords(0) });
    const updated = await placeRepository.update(created.id, { address: '大阪市北区' });
    expect(updated.address).toBe('大阪市北区');
  });

  it('includes address when serialising for a backup (new export)', async () => {
    const { tripId, dayId } = await seed();
    const created = await placeRepository.add({
      tripId,
      dayId,
      address: '北海道札幌市',
      ...coords(0),
    });
    const serialised = placeToRecord(created);
    expect(serialised).toHaveProperty('address', '北海道札幌市');
    // The serialised record must round-trip cleanly through JSON.
    const json = JSON.parse(JSON.stringify(serialised)) as { address: string };
    expect(json.address).toBe('北海道札幌市');
  });
});

describe('reverseGeocodePatch', () => {
  const base: Place = {
    id: 'p1',
    tripId: 't1',
    dayId: 'd1',
    name: DEFAULT_PLACE_NAME,
    category: 'sightseeing',
    latitude: 35,
    longitude: 135,
    address: null,
    startTime: null,
    stayMinutes: null,
    travelMinutes: null,
    memo: '',
    url: '',
    estimatedCost: null,
    order: 0,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
  };

  it('fills the address and the still-default name', () => {
    const patch = reverseGeocodePatch(base, { name: '清水寺', address: '京都市東山区' });
    expect(patch).toEqual({ name: '清水寺', address: '京都市東山区' });
  });

  it('does not overwrite a name the user already edited', () => {
    const edited = { ...base, name: 'わたしの名前' };
    const patch = reverseGeocodePatch(edited, { name: '清水寺', address: '京都市東山区' });
    expect(patch).toEqual({ address: '京都市東山区' });
  });

  it('does not overwrite an address the user already entered', () => {
    const edited = { ...base, address: '自分で入れた住所' };
    const patch = reverseGeocodePatch(edited, { name: '清水寺', address: '京都市東山区' });
    expect(patch).toEqual({ name: '清水寺' });
  });

  it('returns null when there is nothing to apply', () => {
    const patch = reverseGeocodePatch(base, { name: null, address: null });
    expect(patch).toBeNull();
  });

  it('returns null when name is edited and address already present', () => {
    const edited = { ...base, name: '編集済み', address: '既存住所' };
    const patch = reverseGeocodePatch(edited, { name: '清水寺', address: '京都市東山区' });
    expect(patch).toBeNull();
  });
});

describe('corrupt data rejection', () => {
  it('rejects an invalid stored record on read', async () => {
    const { tripId, dayId } = await seed();
    // Bypass validation to store a record with an impossible latitude.
    await db.places.add({
      id: 'corrupt',
      tripId,
      dayId,
      name: 'broken',
      category: 'sightseeing',
      latitude: 999,
      longitude: 0,
      startTime: null,
      stayMinutes: null,
      travelMinutes: null,
      memo: '',
      url: '',
      estimatedCost: null,
      order: 0,
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    } as unknown as PlaceRecord);

    await expect(placeRepository.listByTrip(tripId)).rejects.toThrow();
  });
});
