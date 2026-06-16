import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { placeRepository } from './placeRepository';
import { tripRepository } from './tripRepository';

beforeEach(async () => {
  await Promise.all([db.trips.clear(), db.days.clear(), db.places.clear()]);
});

describe('tripRepository.create', () => {
  it('generates one ordered day per date in the range', async () => {
    const trip = await tripRepository.create({
      title: '関西旅行',
      description: '食べ歩き',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
    });

    expect(trip.schemaVersion).toBe(1);
    const days = await tripRepository.listDays(trip.id);
    expect(days.map((day) => day.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(days.map((day) => day.order)).toEqual([0, 1, 2]);
  });
});

describe('tripRepository.updateDetails', () => {
  it('reconciles days when the range shrinks and rescues orphaned places', async () => {
    const trip = await tripRepository.create({
      title: '関西旅行',
      description: '',
      startDate: '2026-07-01',
      endDate: '2026-07-03',
    });
    const days = await tripRepository.listDays(trip.id);
    const lastDay = days[2];

    await placeRepository.add({
      tripId: trip.id,
      dayId: lastDay.id,
      latitude: 34.7,
      longitude: 135.5,
      name: '通天閣',
    });

    await tripRepository.updateDetails(trip.id, {
      title: '関西旅行',
      description: '',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    });

    const remainingDays = await tripRepository.listDays(trip.id);
    expect(remainingDays.map((day) => day.date)).toEqual(['2026-07-01', '2026-07-02']);

    // The place from the removed day 3 moved to the last remaining day.
    const places = await placeRepository.listByTrip(trip.id);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('通天閣');
    expect(places[0].dayId).toBe(remainingDays[1].id);
  });

  it('keeps existing day ids for dates still in range', async () => {
    const trip = await tripRepository.create({
      title: 'x',
      description: '',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
    });
    const before = await tripRepository.listDays(trip.id);

    await tripRepository.updateDetails(trip.id, {
      title: 'x',
      description: '',
      startDate: '2026-07-01',
      endDate: '2026-07-04',
    });
    const after = await tripRepository.listDays(trip.id);

    expect(after).toHaveLength(4);
    expect(after[0].id).toBe(before[0].id);
    expect(after[1].id).toBe(before[1].id);
  });
});

describe('tripRepository.duplicate', () => {
  it('deep-copies the trip, days and places with new ids', async () => {
    const trip = await tripRepository.create({
      title: '九州旅行',
      description: '',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
    });
    const days = await tripRepository.listDays(trip.id);
    const original = await placeRepository.add({
      tripId: trip.id,
      dayId: days[0].id,
      latitude: 33.6,
      longitude: 130.4,
      name: '太宰府',
    });

    const copy = await tripRepository.duplicate(trip.id);
    expect(copy.id).not.toBe(trip.id);
    expect(copy.title).toBe('九州旅行（コピー）');

    const copyDays = await tripRepository.listDays(copy.id);
    expect(copyDays).toHaveLength(2);

    const copyPlaces = await placeRepository.listByTrip(copy.id);
    expect(copyPlaces).toHaveLength(1);
    expect(copyPlaces[0].id).not.toBe(original.id);
    expect(copyPlaces[0].name).toBe('太宰府');
    // The copied place belongs to a copied day, not the original.
    expect(copyDays.some((day) => day.id === copyPlaces[0].dayId)).toBe(true);
  });
});

describe('tripRepository.remove', () => {
  it('cascades to days and places', async () => {
    const trip = await tripRepository.create({
      title: 'x',
      description: '',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
    });
    const days = await tripRepository.listDays(trip.id);
    await placeRepository.add({
      tripId: trip.id,
      dayId: days[0].id,
      latitude: 35,
      longitude: 135,
    });

    await tripRepository.remove(trip.id);

    expect(await tripRepository.get(trip.id)).toBeUndefined();
    expect(await tripRepository.listDays(trip.id)).toHaveLength(0);
    expect(await placeRepository.listByTrip(trip.id)).toHaveLength(0);
  });
});
