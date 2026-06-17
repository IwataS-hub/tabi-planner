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

    const importedDays = await tripRepository.listDays(imported.id);
    const importedPlaces = await placeRepository.listByTrip(imported.id);

    // No id is reused from the source trip/days.
    const oldDayIds = new Set(days.map((d) => d.id));
    expect(importedDays.every((d) => !oldDayIds.has(d.id))).toBe(true);
    expect(importedDays.every((d) => d.tripId === imported.id)).toBe(true);

    // Places point at the new days, preserving the day each spot was on.
    for (const place of importedPlaces) {
      expect(place.tripId).toBe(imported.id);
      expect(importedDays.some((d) => d.id === place.dayId)).toBe(true);
    }
    expect(importedPlaces.find((p) => p.name === '松本城')!.dayId).toBe(importedDays[0].id);
    expect(importedPlaces.find((p) => p.name === '上高地')!.dayId).toBe(importedDays[1].id);
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
