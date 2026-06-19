import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { reservationRepository } from './reservationRepository';
import { placeRepository } from './placeRepository';
import { tripRepository } from './tripRepository';

async function seed() {
  const trip = await tripRepository.create({
    title: '予約テスト旅行',
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
    db.reservations.clear(),
  ]);
});

describe('reservationRepository', () => {
  it('adds a reservation', async () => {
    const { tripId, dayId } = await seed();
    const r = await reservationRepository.add({
      tripId,
      dayId,
      kind: 'lodging',
      title: 'ホテル松島',
    });
    expect(r.title).toBe('ホテル松島');
    expect(r.kind).toBe('lodging');
    expect(r.dayId).toBe(dayId);
    expect(r.confirmationCode).toBe('');
    expect(r.isPrivate).toBe(false);
  });

  it('lists reservations sorted by startAt', async () => {
    const { tripId, dayId } = await seed();
    const r1 = await reservationRepository.add({
      tripId,
      dayId,
      kind: 'restaurant',
      title: '夕食',
      startAt: '2026-08-01T18:00:00.000Z',
    });
    const r2 = await reservationRepository.add({
      tripId,
      dayId,
      kind: 'transport',
      title: '新幹線',
      startAt: '2026-08-01T09:00:00.000Z',
    });
    const list = await reservationRepository.listByTrip(tripId);
    expect(list[0].id).toBe(r2.id);
    expect(list[1].id).toBe(r1.id);
  });

  it('updates a reservation', async () => {
    const { tripId } = await seed();
    const r = await reservationRepository.add({ tripId, kind: 'other', title: '予約' });
    const updated = await reservationRepository.update(r.id, {
      title: '更新予約',
      confirmationCode: 'ABC123',
      isPrivate: true,
    });
    expect(updated.title).toBe('更新予約');
    expect(updated.confirmationCode).toBe('ABC123');
    expect(updated.isPrivate).toBe(true);
  });

  it('deletes a reservation', async () => {
    const { tripId } = await seed();
    const r = await reservationRepository.add({ tripId, kind: 'event', title: 'ライブ' });
    await reservationRepository.remove(r.id);
    const list = await reservationRepository.listByTrip(tripId);
    expect(list).toHaveLength(0);
  });

  it('listByDay returns only reservations for that day', async () => {
    const { tripId, dayId, day2Id } = await seed();
    await reservationRepository.add({ tripId, dayId, kind: 'lodging', title: 'Day1 Hotel' });
    await reservationRepository.add({
      tripId,
      dayId: day2Id,
      kind: 'activity',
      title: 'Day2 Activity',
    });
    const day1Res = await reservationRepository.listByDay(dayId);
    expect(day1Res).toHaveLength(1);
    expect(day1Res[0].title).toBe('Day1 Hotel');
  });

  it('handles null dayId (unassigned)', async () => {
    const { tripId } = await seed();
    const r = await reservationRepository.add({
      tripId,
      kind: 'transport',
      title: '航空券',
      dayId: null,
    });
    expect(r.dayId).toBeNull();
    const list = await reservationRepository.listByTrip(tripId);
    expect(list[0].dayId).toBeNull();
  });

  it('rejects referencing non-existent reservation', async () => {
    await expect(reservationRepository.update('nonexistent', { title: '更新' })).rejects.toThrow();
  });

  it('links to a place', async () => {
    const { tripId, dayId } = await seed();
    const place = await placeRepository.add({
      tripId,
      dayId,
      latitude: 35,
      longitude: 135,
      name: '観光地',
    });
    const r = await reservationRepository.add({
      tripId,
      dayId,
      kind: 'activity',
      title: 'アクティビティ',
      placeId: place.id,
    });
    expect(r.placeId).toBe(place.id);
  });
});

describe('reservationRepository referential integrity', () => {
  beforeEach(async () => {
    await Promise.all([
      db.trips.clear(),
      db.days.clear(),
      db.places.clear(),
      db.reservations.clear(),
    ]);
  });

  it('rejects add with non-existent tripId', async () => {
    await expect(
      reservationRepository.add({ tripId: 'ghost-trip', kind: 'lodging', title: 'Hotel' }),
    ).rejects.toThrow(/旅行が見つかりません/);
    expect(await db.reservations.count()).toBe(0);
  });

  it('rejects add when dayId belongs to a different trip', async () => {
    const trip1 = await tripRepository.create({
      title: '旅行1',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const trip2 = await tripRepository.create({
      title: '旅行2',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const days2 = await tripRepository.listDays(trip2.id);
    await expect(
      reservationRepository.add({
        tripId: trip1.id,
        dayId: days2[0].id,
        kind: 'lodging',
        title: 'Hotel',
      }),
    ).rejects.toThrow(/別の旅行/);
    expect(await db.reservations.count()).toBe(0);
  });

  it('rejects add when placeId belongs to a different trip', async () => {
    const trip1 = await tripRepository.create({
      title: '旅行1',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const trip2 = await tripRepository.create({
      title: '旅行2',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const days2 = await tripRepository.listDays(trip2.id);
    const place2 = await placeRepository.add({
      tripId: trip2.id,
      dayId: days2[0].id,
      latitude: 35,
      longitude: 135,
    });
    await expect(
      reservationRepository.add({
        tripId: trip1.id,
        placeId: place2.id,
        kind: 'lodging',
        title: 'Hotel',
      }),
    ).rejects.toThrow(/別の旅行/);
  });

  it('rejects add when placeId.dayId does not match dayId', async () => {
    const trip = await tripRepository.create({
      title: '旅行',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
    });
    const days = await tripRepository.listDays(trip.id);
    const place = await placeRepository.add({
      tripId: trip.id,
      dayId: days[0].id,
      latitude: 35,
      longitude: 135,
    });
    await expect(
      reservationRepository.add({
        tripId: trip.id,
        dayId: days[1].id,
        placeId: place.id,
        kind: 'activity',
        title: 'アクティビティ',
      }),
    ).rejects.toThrow(/対応していません/);
  });

  it('rejects add when endAt < startAt', async () => {
    const trip = await tripRepository.create({
      title: '旅行',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    await expect(
      reservationRepository.add({
        tripId: trip.id,
        kind: 'transport',
        title: '電車',
        startAt: '2026-08-01T12:00:00.000Z',
        endAt: '2026-08-01T10:00:00.000Z',
      }),
    ).rejects.toThrow(/開始時刻/);
  });

  it('rejects update when dayId belongs to a different trip', async () => {
    const trip1 = await tripRepository.create({
      title: '旅行1',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const trip2 = await tripRepository.create({
      title: '旅行2',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const days2 = await tripRepository.listDays(trip2.id);
    const r = await reservationRepository.add({ tripId: trip1.id, kind: 'other', title: '予約' });
    await expect(reservationRepository.update(r.id, { dayId: days2[0].id })).rejects.toThrow(
      /別の旅行/,
    );
  });

  it('rejects update when endAt < startAt', async () => {
    const trip = await tripRepository.create({
      title: '旅行',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const r = await reservationRepository.add({ tripId: trip.id, kind: 'other', title: '予約' });
    await expect(
      reservationRepository.update(r.id, {
        startAt: '2026-08-01T12:00:00.000Z',
        endAt: '2026-08-01T10:00:00.000Z',
      }),
    ).rejects.toThrow(/開始時刻/);
  });
});
