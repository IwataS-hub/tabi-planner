import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { candidatePlaceRepository } from './candidatePlaceRepository';
import { tripRepository } from './tripRepository';
import { placeRepository } from './placeRepository';

async function seed() {
  const trip = await tripRepository.create({
    title: '候補テスト旅行',
    description: '',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
  });
  const days = await tripRepository.listDays(trip.id);
  return { tripId: trip.id, dayId: days[0].id, day2Id: days[1].id };
}

beforeEach(async () => {
  await Promise.all([
    db.trips.clear(),
    db.days.clear(),
    db.places.clear(),
    db.candidatePlaces.clear(),
  ]);
});

describe('candidatePlaceRepository', () => {
  it('adds a candidate place', async () => {
    const { tripId } = await seed();
    const c = await candidatePlaceRepository.add({
      tripId,
      name: '候補スポット',
      latitude: 35,
      longitude: 135,
    });
    expect(c.name).toBe('候補スポット');
    expect(c.tripId).toBe(tripId);
    expect(c.order).toBe(0);
  });

  it('lists candidates in order', async () => {
    const { tripId } = await seed();
    const a = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'A',
    });
    const b = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 136,
      name: 'B',
    });
    const list = await candidatePlaceRepository.listByTrip(tripId);
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
  });

  it('updates a candidate', async () => {
    const { tripId } = await seed();
    const c = await candidatePlaceRepository.add({ tripId, latitude: 35, longitude: 135 });
    const updated = await candidatePlaceRepository.update(c.id, { name: '更新済み' });
    expect(updated.name).toBe('更新済み');
  });

  it('removes a candidate and repacks order', async () => {
    const { tripId } = await seed();
    const a = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'A',
    });
    const b = await candidatePlaceRepository.add({
      tripId,
      latitude: 36,
      longitude: 135,
      name: 'B',
    });
    const c = await candidatePlaceRepository.add({
      tripId,
      latitude: 37,
      longitude: 135,
      name: 'C',
    });
    await candidatePlaceRepository.remove(b.id);
    const remaining = await candidatePlaceRepository.listByTrip(tripId);
    expect(remaining).toHaveLength(2);
    expect(remaining[0].order).toBe(0);
    expect(remaining[1].order).toBe(1);
    expect(remaining.map((x) => x.id)).toContain(a.id);
    expect(remaining.map((x) => x.id)).toContain(c.id);
  });

  it('promotes a candidate to a scheduled place', async () => {
    const { tripId, dayId } = await seed();
    const c = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: '候補',
      address: '東京都',
    });
    await candidatePlaceRepository.promoteToDay(c.id, dayId);

    // Candidate should be gone
    const candidates = await candidatePlaceRepository.listByTrip(tripId);
    expect(candidates).toHaveLength(0);

    // A place should exist in the day
    const places = await placeRepository.listByDay(dayId);
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('候補');
    expect(places[0].dayId).toBe(dayId);
  });

  it('reorders candidates', async () => {
    const { tripId } = await seed();
    const a = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'A',
    });
    const b = await candidatePlaceRepository.add({
      tripId,
      latitude: 36,
      longitude: 135,
      name: 'B',
    });
    const c = await candidatePlaceRepository.add({
      tripId,
      latitude: 37,
      longitude: 135,
      name: 'C',
    });
    await candidatePlaceRepository.reorder(tripId, [c.id, a.id, b.id]);
    const list = await candidatePlaceRepository.listByTrip(tripId);
    expect(list.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  });

  it('reorder updates updatedAt on changed records', async () => {
    const { tripId } = await seed();
    const a = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'A',
    });
    const b = await candidatePlaceRepository.add({
      tripId,
      latitude: 36,
      longitude: 135,
      name: 'B',
    });
    const before = (await db.candidatePlaces.get(a.id))!.updatedAt;
    await candidatePlaceRepository.reorder(tripId, [b.id, a.id]);
    const afterA = (await db.candidatePlaces.get(a.id))!;
    const afterB = (await db.candidatePlaces.get(b.id))!;
    expect(afterA.order).toBe(1);
    expect(afterB.order).toBe(0);
    expect(afterA.updatedAt >= before).toBe(true);
    expect(afterB.updatedAt >= before).toBe(true);
  });

  it('remove repacks remaining candidates and updates their updatedAt', async () => {
    const { tripId } = await seed();
    const a = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'A',
    });
    const b = await candidatePlaceRepository.add({
      tripId,
      latitude: 36,
      longitude: 135,
      name: 'B',
    });
    const c = await candidatePlaceRepository.add({
      tripId,
      latitude: 37,
      longitude: 135,
      name: 'C',
    });
    const beforeC = (await db.candidatePlaces.get(c.id))!.updatedAt;
    await candidatePlaceRepository.remove(b.id);
    const remaining = await candidatePlaceRepository.listByTrip(tripId);
    expect(remaining.map((x) => x.id)).toEqual([a.id, c.id]);
    expect(remaining[0].order).toBe(0);
    expect(remaining[1].order).toBe(1);
    const afterC = (await db.candidatePlaces.get(c.id))!;
    expect(afterC.updatedAt >= beforeC).toBe(true);
  });

  it('promoteToDay repacks remaining candidates and updates their updatedAt', async () => {
    const { tripId, dayId } = await seed();
    const a = await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'A',
    });
    const b = await candidatePlaceRepository.add({
      tripId,
      latitude: 36,
      longitude: 135,
      name: 'B',
    });
    const beforeB = (await db.candidatePlaces.get(b.id))!.updatedAt;
    await candidatePlaceRepository.promoteToDay(a.id, dayId);
    const remaining = await candidatePlaceRepository.listByTrip(tripId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(b.id);
    expect(remaining[0].order).toBe(0);
    const afterB = (await db.candidatePlaces.get(b.id))!;
    expect(afterB.updatedAt >= beforeB).toBe(true);
  });

  it('throws when promoting to a day in different trip', async () => {
    const { tripId } = await seed();
    const trip2 = await tripRepository.create({
      title: '別旅行',
      description: '',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });
    const c = await candidatePlaceRepository.add({ tripId, latitude: 35, longitude: 135 });
    const days2 = await tripRepository.listDays(trip2.id);
    await expect(candidatePlaceRepository.promoteToDay(c.id, days2[0].id)).rejects.toThrow();
  });
});

describe('movePlaceToCandidate', () => {
  it('moves a scheduled place to candidates', async () => {
    const { tripId, dayId } = await seed();
    const { movePlaceToCandidate } = await import('./placeRepository');
    const place = await placeRepository.add({
      tripId,
      dayId,
      latitude: 35,
      longitude: 135,
      name: '元スポット',
    });
    const candidate = await movePlaceToCandidate(place.id);
    expect(candidate.name).toBe('元スポット');

    const places = await placeRepository.listByDay(dayId);
    expect(places).toHaveLength(0);
    const candidates = await candidatePlaceRepository.listByTrip(tripId);
    expect(candidates).toHaveLength(1);
  });
});

describe('movePlaceToDay', () => {
  it('moves a place from one day to another', async () => {
    const { tripId, dayId, day2Id } = await seed();
    const { movePlaceToDay } = await import('./placeRepository');
    const place = await placeRepository.add({ tripId, dayId, latitude: 35, longitude: 135 });
    await movePlaceToDay(place.id, day2Id);

    const placesDay1 = await placeRepository.listByDay(dayId);
    const placesDay2 = await placeRepository.listByDay(day2Id);
    expect(placesDay1).toHaveLength(0);
    expect(placesDay2).toHaveLength(1);
    expect(placesDay2[0].dayId).toBe(day2Id);
  });

  it('normalises order after cross-day move', async () => {
    const { tripId, dayId, day2Id } = await seed();
    const { movePlaceToDay } = await import('./placeRepository');
    const a = await placeRepository.add({ tripId, dayId, latitude: 35, longitude: 135 });
    const b = await placeRepository.add({ tripId, dayId, latitude: 36, longitude: 135 });
    await placeRepository.add({ tripId, dayId: day2Id, latitude: 37, longitude: 135 });

    // Move a from day1 to day2
    await movePlaceToDay(a.id, day2Id);

    const day1Places = await placeRepository.listByDay(dayId);
    const day2Places = await placeRepository.listByDay(day2Id);
    // day1 should have only b with order 0
    expect(day1Places).toHaveLength(1);
    expect(day1Places[0].id).toBe(b.id);
    expect(day1Places[0].order).toBe(0);
    // day2 should have c (pre-existing) and a (moved)
    expect(day2Places).toHaveLength(2);
    expect(day2Places.every((p, i) => p.order === i)).toBe(true);
  });
});
