import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { parseBackup } from '@/domain/backup';
import { candidatePlaceRepository } from './candidatePlaceRepository';
import { reservationRepository } from './reservationRepository';
import { placeRepository } from './placeRepository';
import { tripRepository } from './tripRepository';

beforeEach(async () => {
  await Promise.all([
    db.trips.clear(),
    db.days.clear(),
    db.places.clear(),
    db.participants.clear(),
    db.expenses.clear(),
    db.expenseShares.clear(),
    db.checklistItems.clear(),
    db.candidatePlaces.clear(),
    db.reservations.clear(),
  ]);
});

async function seedFull() {
  const trip = await tripRepository.create({
    title: 'フルテスト旅行',
    description: '',
    startDate: '2026-07-01',
    endDate: '2026-07-02',
  });
  const days = await tripRepository.listDays(trip.id);
  const place = await placeRepository.add({
    tripId: trip.id,
    dayId: days[0].id,
    latitude: 35.0,
    longitude: 135.0,
    name: 'スポット1',
  });
  const candidate = await candidatePlaceRepository.add({
    tripId: trip.id,
    latitude: 36.0,
    longitude: 136.0,
    name: '候補スポット',
    address: '東京都新宿区',
  });
  const res = await reservationRepository.add({
    tripId: trip.id,
    dayId: days[0].id,
    placeId: place.id,
    kind: 'lodging',
    title: 'ホテル旅館',
    confirmationCode: 'RES-001',
    startAt: '2026-07-01T15:00:00.000Z',
    isPrivate: true,
  });
  return { trip, days, place, candidate, res };
}

describe('Phase 2.4 backup roundtrip', () => {
  it('exports candidatePlaces and reservations', async () => {
    const { trip } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    expect(backup.candidatePlaces).toHaveLength(1);
    expect(backup.candidatePlaces[0].name).toBe('候補スポット');
    expect(backup.reservations).toHaveLength(1);
    expect(backup.reservations[0].title).toBe('ホテル旅館');
    expect(backup.reservations[0].confirmationCode).toBe('RES-001');
  });

  it('imports candidatePlaces with new IDs', async () => {
    const { trip, candidate } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    const reparsed = parseBackup(JSON.stringify(backup));
    const imported = await tripRepository.importBackup(reparsed);

    const importedCandidates = await candidatePlaceRepository.listByTrip(imported.id);
    expect(importedCandidates).toHaveLength(1);
    expect(importedCandidates[0].name).toBe('候補スポット');
    expect(importedCandidates[0].id).not.toBe(candidate.id);
    expect(importedCandidates[0].tripId).toBe(imported.id);
  });

  it('imports reservations with remapped day/place IDs', async () => {
    const { trip, res } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    const reparsed = parseBackup(JSON.stringify(backup));
    const imported = await tripRepository.importBackup(reparsed);

    const importedReservations = await reservationRepository.listByTrip(imported.id);
    expect(importedReservations).toHaveLength(1);
    const r = importedReservations[0];
    expect(r.title).toBe('ホテル旅館');
    expect(r.id).not.toBe(res.id);
    expect(r.tripId).toBe(imported.id);
    // placeId and dayId are remapped to new IDs
    const importedDays = await tripRepository.listDays(imported.id);
    expect(r.dayId).toBe(importedDays[0].id);
    const importedPlaces = await placeRepository.listByTrip(imported.id);
    expect(r.placeId).toBe(importedPlaces[0].id);
  });

  it('private reservation is included in backup', async () => {
    const { trip } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    expect(backup.reservations.some((r) => r.isPrivate)).toBe(true);
  });

  it('old v1 backup without candidatePlaces/reservations remains importable', async () => {
    const { trip } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    // Simulate old backup: remove phase 2.4 fields
    const { candidatePlaces: _c, reservations: _r, ...v1Backup } = backup;
    const reparsed = parseBackup(JSON.stringify(v1Backup));
    const imported = await tripRepository.importBackup(reparsed);
    expect(imported.id).toBeTruthy();
    const candidates = await candidatePlaceRepository.listByTrip(imported.id);
    const reservations = await reservationRepository.listByTrip(imported.id);
    expect(candidates).toHaveLength(0);
    expect(reservations).toHaveLength(0);
  });

  it('rejects backup with reservation referencing invalid dayId', async () => {
    const { trip } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    const corrupted = {
      ...backup,
      reservations: [{ ...backup.reservations[0], dayId: 'nonexistent-day-id' }],
    };
    expect(() => parseBackup(JSON.stringify(corrupted))).toThrow(/日付データが見つかりません/);
  });

  it('rejects backup with reservation referencing invalid placeId', async () => {
    const { trip } = await seedFull();
    const backup = await tripRepository.exportTrip(trip.id);
    const corrupted = {
      ...backup,
      reservations: [{ ...backup.reservations[0], placeId: 'nonexistent-place-id' }],
    };
    expect(() => parseBackup(JSON.stringify(corrupted))).toThrow(/スポットが見つかりません/);
  });
});

describe('Trip duplication (Phase 2.4)', () => {
  it('copies candidatePlaces with new IDs and resets visitStatus to planned', async () => {
    const { tripId } = await (async () => {
      const trip = await tripRepository.create({
        title: '複製テスト',
        description: '',
        startDate: '2026-08-01',
        endDate: '2026-08-01',
      });
      return { tripId: trip.id };
    })();
    await candidatePlaceRepository.add({
      tripId,
      latitude: 35,
      longitude: 135,
      name: 'Candidate A',
    });

    const dup = await tripRepository.duplicate(tripId);
    const origCandidates = await candidatePlaceRepository.listByTrip(tripId);
    const dupCandidates = await candidatePlaceRepository.listByTrip(dup.id);
    expect(dupCandidates).toHaveLength(1);
    expect(dupCandidates[0].name).toBe('Candidate A');
    expect(dupCandidates[0].id).not.toBe(origCandidates[0].id);
    expect(dupCandidates[0].visitStatus).toBe('planned');
  });

  it('does NOT copy reservations (booking info is personal)', async () => {
    const trip = await tripRepository.create({
      title: '予約複製テスト',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    await reservationRepository.add({ tripId: trip.id, kind: 'lodging', title: 'Hotel A' });

    const dup = await tripRepository.duplicate(trip.id);
    const dupReservations = await reservationRepository.listByTrip(dup.id);
    expect(dupReservations).toHaveLength(0);
  });

  it('copies checklist items with completed reset to false', async () => {
    const { checklistItemRepository } = await import('./checklistItemRepository');
    const trip = await tripRepository.create({
      title: 'チェックリスト複製テスト',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    await checklistItemRepository.add({
      tripId: trip.id,
      kind: 'packing',
      title: '歯ブラシ',
      category: '衛生用品',
    });
    const [item] = await checklistItemRepository.listByTrip(trip.id);
    await checklistItemRepository.setCompleted(item.id, true);

    const dup = await tripRepository.duplicate(trip.id);
    const dupItems = await checklistItemRepository.listByTrip(dup.id);
    expect(dupItems).toHaveLength(1);
    expect(dupItems[0].completed).toBe(false); // reset
    expect(dupItems[0].id).not.toBe(item.id);
  });

  it('does NOT copy expenses', async () => {
    const { participantRepository } = await import('./participantRepository');
    const { expenseRepository } = await import('./expenseRepository');
    const trip = await tripRepository.create({
      title: '費用複製テスト',
      description: '',
      startDate: '2026-08-01',
      endDate: '2026-08-01',
    });
    const p = await participantRepository.add({ tripId: trip.id, name: '太郎' });
    await expenseRepository.add({
      tripId: trip.id,
      dayId: null,
      placeId: null,
      title: 'ランチ',
      amountYen: 1500,
      category: 'food',
      payerId: p.id,
      memo: '',
      occurredAt: null,
      shares: [{ participantId: p.id, amountYen: 1500 }],
    });
    const dup = await tripRepository.duplicate(trip.id);
    const dupExpenses = await db.expenses.where('tripId').equals(dup.id).toArray();
    expect(dupExpenses).toHaveLength(0);
  });
});
