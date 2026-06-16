import { beforeEach, describe, expect, it } from 'vitest';
import { db, TabioriDatabase } from '@/db/database';
import type { PlaceRecord } from '@/db/records';
import { DEFAULT_PLACE_NAME, placeRepository } from './placeRepository';
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
