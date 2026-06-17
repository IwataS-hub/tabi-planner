import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { parseBackup, type TripBackup } from '@/domain/backup';
import { placeRepository } from './placeRepository';
import { tripRepository } from './tripRepository';

beforeEach(async () => {
  await Promise.all([db.trips.clear(), db.days.clear(), db.places.clear()]);
});

async function seedTrip() {
  const trip = await tripRepository.create({
    title: '信州旅行',
    description: '温泉と山',
    startDate: '2026-07-01',
    endDate: '2026-07-02',
  });
  const days = await tripRepository.listDays(trip.id);
  await placeRepository.add({
    tripId: trip.id,
    dayId: days[0].id,
    latitude: 36.238,
    longitude: 137.972,
    name: '松本城',
  });
  await placeRepository.add({
    tripId: trip.id,
    dayId: days[1].id,
    latitude: 36.25,
    longitude: 137.63,
    name: '上高地',
  });
  return { trip, days };
}

describe('export → import round-trip', () => {
  it('imports a serialized backup as an independent new trip', async () => {
    const { trip } = await seedTrip();

    const backup = await tripRepository.exportTrip(trip.id);
    // Go through the real serialize → validate path, as a file would.
    const reparsed = parseBackup(JSON.stringify(backup));
    const imported = await tripRepository.importBackup(reparsed);

    expect(imported.id).not.toBe(trip.id);
    const importedPlaces = await placeRepository.listByTrip(imported.id);
    const names = importedPlaces.map((p) => p.name);
    expect(names).toHaveLength(2);
    expect(names).toContain('松本城');
    expect(names).toContain('上高地');

    // The original trip is untouched and both trips now coexist.
    expect(await placeRepository.listByTrip(trip.id)).toHaveLength(2);
    expect(await db.trips.count()).toBe(2);
  });

  it('regenerates every id and rewires day references by position', async () => {
    const { trip, days } = await seedTrip();
    const backup = await tripRepository.exportTrip(trip.id);
    const imported = await tripRepository.importBackup(backup);

    const sourcePlaces = await placeRepository.listByTrip(trip.id);
    const importedDays = await tripRepository.listDays(imported.id);
    const importedPlaces = await placeRepository.listByTrip(imported.id);

    // No id is reused from the source trip/days.
    const oldDayIds = new Set(days.map((d) => d.id));
    const oldPlaceIds = new Set(sourcePlaces.map((p) => p.id));
    expect(importedDays.every((d) => !oldDayIds.has(d.id))).toBe(true);
    expect(importedPlaces.every((p) => !oldPlaceIds.has(p.id))).toBe(true);
    expect(importedDays.every((d) => d.tripId === imported.id)).toBe(true);

    // Places point at the new days, preserving the day each spot was on.
    for (const place of importedPlaces) {
      expect(place.tripId).toBe(imported.id);
      expect(importedDays.some((d) => d.id === place.dayId)).toBe(true);
    }
    expect(importedPlaces.find((p) => p.name === '松本城')!.dayId).toBe(importedDays[0].id);
    expect(importedPlaces.find((p) => p.name === '上高地')!.dayId).toBe(importedDays[1].id);
  });

  it('normalizes day order and place order within each imported day', async () => {
    const { trip } = await seedTrip();
    const backup = await tripRepository.exportTrip(trip.id);
    const imported = await tripRepository.importBackup({
      ...backup,
      days: [
        { ...backup.days[1], order: 20 },
        { ...backup.days[0], order: 10 },
      ],
      places: [
        { ...backup.places[1], order: 7 },
        { ...backup.places[0], order: 3 },
        {
          ...backup.places[0],
          id: 'extra-place',
          name: '縄手通り',
          order: 1,
        },
      ],
    });

    const importedDays = await tripRepository.listDays(imported.id);
    expect(importedDays.map((day) => day.date)).toEqual(['2026-07-01', '2026-07-02']);
    expect(importedDays.map((day) => day.order)).toEqual([0, 1]);

    const firstDayPlaces = await placeRepository.listByDay(importedDays[0].id);
    const secondDayPlaces = await placeRepository.listByDay(importedDays[1].id);
    expect(firstDayPlaces.map((place) => place.name)).toEqual(['縄手通り', '松本城']);
    expect(firstDayPlaces.map((place) => place.order)).toEqual([0, 1]);
    expect(secondDayPlaces.map((place) => place.name)).toEqual(['上高地']);
    expect(secondDayPlaces.map((place) => place.order)).toEqual([0]);
  });

  it('exports days by date and places by within-day order with stable tie-breaks', async () => {
    const { trip, days } = await seedTrip();
    const firstDayPlaces = await db.places.where('dayId').equals(days[0].id).toArray();
    const secondDayPlaces = await db.places.where('dayId').equals(days[1].id).toArray();
    const firstDayPlace = firstDayPlaces[0];
    const secondDayPlace = secondDayPlaces[0];
    if (!firstDayPlace || !secondDayPlace) throw new Error('seed failed');

    await db.days.bulkPut([
      { ...days[0], order: 10 },
      { ...days[1], order: 0 },
    ]);
    await db.places.bulkPut([
      {
        ...firstDayPlace,
        name: '松本城',
        order: 0,
        createdAt: '2026-07-01T10:00:00.000Z',
      },
      {
        ...firstDayPlace,
        id: 'same-order-earlier',
        name: '縄手通り',
        order: 0,
        createdAt: '2026-07-01T09:00:00.000Z',
      },
      {
        ...secondDayPlace,
        name: '上高地',
        order: 0,
        createdAt: '2026-07-02T09:00:00.000Z',
      },
    ]);

    const first = await tripRepository.exportTrip(trip.id);
    const second = await tripRepository.exportTrip(trip.id);

    expect(first.days.map((day) => day.date)).toEqual(['2026-07-01', '2026-07-02']);
    expect(first.places.map((place) => place.name)).toEqual(['縄手通り', '松本城', '上高地']);
    expect(second.places.map((place) => place.id)).toEqual(first.places.map((place) => place.id));
  });

  it('adds a suffix to avoid title collisions', async () => {
    const { trip } = await seedTrip();
    const backup = await tripRepository.exportTrip(trip.id);
    const imported = await tripRepository.importBackup(backup);
    expect(imported.title).toBe('信州旅行（読み込み）');
  });

  it('does not partially save when a record is invalid (single transaction)', async () => {
    const { trip } = await seedTrip();
    const backup = await tripRepository.exportTrip(trip.id);

    const tripsBefore = await db.trips.count();
    const daysBefore = await db.days.count();
    const placesBefore = await db.places.count();

    // Corrupt one place so validation throws inside the import transaction.
    const broken: TripBackup = {
      ...backup,
      places: [{ ...backup.places[0], estimatedCost: -100 }],
    };
    await expect(tripRepository.importBackup(broken)).rejects.toThrow();

    // Nothing from the failed import remains.
    expect(await db.trips.count()).toBe(tripsBefore);
    expect(await db.days.count()).toBe(daysBefore);
    expect(await db.places.count()).toBe(placesBefore);
  });
});
