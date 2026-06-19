import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { expenseRepository } from './expenseRepository';
import { participantRepository } from './participantRepository';
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
  ]);
});

async function seed() {
  const trip = await tripRepository.create({
    title: 'テスト旅行',
    description: '',
    startDate: '2026-08-01',
    endDate: '2026-08-01',
  });
  const days = await tripRepository.listDays(trip.id);
  const dayId = days[0]!.id;
  const alice = await participantRepository.add({ tripId: trip.id, name: 'Alice' });
  const bob = await participantRepository.add({ tripId: trip.id, name: 'Bob' });
  const place = await placeRepository.add({
    tripId: trip.id,
    dayId,
    latitude: 35.0,
    longitude: 135.0,
  });
  return { tripId: trip.id, dayId, alice, bob, placeId: place.id };
}

function validDraft(overrides: Partial<Parameters<typeof expenseRepository.add>[0]> = {}) {
  return {
    tripId: '',
    dayId: null,
    placeId: null,
    title: '夕食',
    amountYen: 3000,
    category: 'food' as const,
    payerId: '',
    occurredAt: null,
    memo: '',
    shares: [] as { participantId: string; amountYen: number }[],
    ...overrides,
  };
}

describe('expenseRepository.add – constraint validation', () => {
  it('saves normally when all constraints pass', async () => {
    const { tripId, alice, bob } = await seed();
    const result = await expenseRepository.add(
      validDraft({
        tripId,
        payerId: alice.id,
        shares: [
          { participantId: alice.id, amountYen: 1500 },
          { participantId: bob.id, amountYen: 1500 },
        ],
      }),
    );
    expect(result.expense.amountYen).toBe(3000);
    expect(result.shares).toHaveLength(2);
    expect(await db.expenses.count()).toBe(1);
    expect(await db.expenseShares.count()).toBe(2);
  });

  it('rejects when shares sum does not equal amountYen', async () => {
    const { tripId, alice, bob } = await seed();
    await expect(
      expenseRepository.add(
        validDraft({
          tripId,
          payerId: alice.id,
          shares: [
            { participantId: alice.id, amountYen: 1000 },
            { participantId: bob.id, amountYen: 1000 },
          ],
        }),
      ),
    ).rejects.toThrow(/分担合計/);
    expect(await db.expenses.count()).toBe(0);
  });

  it('rejects when shares array is empty', async () => {
    const { tripId, alice } = await seed();
    await expect(
      expenseRepository.add(validDraft({ tripId, payerId: alice.id, shares: [] })),
    ).rejects.toThrow(/分担者が設定されていません/);
  });

  it('rejects when payerId is not a participant of the trip', async () => {
    const { tripId, alice, bob } = await seed();
    await expect(
      expenseRepository.add(
        validDraft({
          tripId,
          payerId: 'ghost-payer',
          shares: [
            { participantId: alice.id, amountYen: 1500 },
            { participantId: bob.id, amountYen: 1500 },
          ],
        }),
      ),
    ).rejects.toThrow(/支払者が参加者/);
  });

  it('rejects when a share participantId is not a participant of the trip', async () => {
    const { tripId, alice } = await seed();
    await expect(
      expenseRepository.add(
        validDraft({
          tripId,
          payerId: alice.id,
          amountYen: 3000,
          shares: [
            { participantId: alice.id, amountYen: 1500 },
            { participantId: 'ghost-bob', amountYen: 1500 },
          ],
        }),
      ),
    ).rejects.toThrow(/分担者が参加者/);
  });

  it('rejects when share participantIds are duplicated', async () => {
    const { tripId, alice } = await seed();
    await expect(
      expenseRepository.add(
        validDraft({
          tripId,
          payerId: alice.id,
          shares: [
            { participantId: alice.id, amountYen: 1500 },
            { participantId: alice.id, amountYen: 1500 },
          ],
        }),
      ),
    ).rejects.toThrow(/重複/);
  });

  it('rejects when dayId belongs to a different trip', async () => {
    const { tripId, alice, bob } = await seed();
    const otherTrip = await tripRepository.create({
      title: '別旅行',
      description: '',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });
    const otherDays = await tripRepository.listDays(otherTrip.id);
    await expect(
      expenseRepository.add(
        validDraft({
          tripId,
          dayId: otherDays[0]!.id,
          payerId: alice.id,
          shares: [
            { participantId: alice.id, amountYen: 1500 },
            { participantId: bob.id, amountYen: 1500 },
          ],
        }),
      ),
    ).rejects.toThrow(/日付が旅行に存在しません/);
  });

  it('rejects when placeId belongs to a different trip', async () => {
    const { tripId, alice, bob } = await seed();
    const otherTrip = await tripRepository.create({
      title: '別旅行',
      description: '',
      startDate: '2026-09-01',
      endDate: '2026-09-01',
    });
    const otherDays = await tripRepository.listDays(otherTrip.id);
    const otherPlace = await placeRepository.add({
      tripId: otherTrip.id,
      dayId: otherDays[0]!.id,
      latitude: 34.0,
      longitude: 134.0,
    });
    await expect(
      expenseRepository.add(
        validDraft({
          tripId,
          placeId: otherPlace.id,
          payerId: alice.id,
          shares: [
            { participantId: alice.id, amountYen: 1500 },
            { participantId: bob.id, amountYen: 1500 },
          ],
        }),
      ),
    ).rejects.toThrow(/スポットが旅行に存在しません/);
  });
});

describe('expenseRepository.update – constraint validation', () => {
  it('applies the same validations on update', async () => {
    const { tripId, alice, bob } = await seed();
    const { expense } = await expenseRepository.add(
      validDraft({
        tripId,
        payerId: alice.id,
        shares: [
          { participantId: alice.id, amountYen: 1500 },
          { participantId: bob.id, amountYen: 1500 },
        ],
      }),
    );

    // Valid update
    const updated = await expenseRepository.update(expense.id, {
      dayId: null,
      placeId: null,
      title: '朝食',
      amountYen: 2000,
      category: 'food',
      payerId: bob.id,
      occurredAt: null,
      memo: '',
      shares: [
        { participantId: alice.id, amountYen: 1000 },
        { participantId: bob.id, amountYen: 1000 },
      ],
    });
    expect(updated.expense.amountYen).toBe(2000);

    // Invalid update: shares sum mismatch
    await expect(
      expenseRepository.update(expense.id, {
        dayId: null,
        placeId: null,
        title: '昼食',
        amountYen: 5000,
        category: 'food',
        payerId: alice.id,
        occurredAt: null,
        memo: '',
        shares: [{ participantId: alice.id, amountYen: 1000 }],
      }),
    ).rejects.toThrow(/分担合計/);
  });

  it('does not partially save when update validation fails', async () => {
    const { tripId, alice, bob } = await seed();
    const { expense } = await expenseRepository.add(
      validDraft({
        tripId,
        payerId: alice.id,
        shares: [
          { participantId: alice.id, amountYen: 1500 },
          { participantId: bob.id, amountYen: 1500 },
        ],
      }),
    );

    await expect(
      expenseRepository.update(expense.id, {
        dayId: null,
        placeId: null,
        title: '昼食',
        amountYen: 9999,
        category: 'food',
        payerId: 'ghost',
        occurredAt: null,
        memo: '',
        shares: [{ participantId: alice.id, amountYen: 9999 }],
      }),
    ).rejects.toThrow();

    // Original expense unchanged
    const unchanged = await expenseRepository.get(expense.id);
    expect(unchanged?.expense.amountYen).toBe(3000);
    expect(unchanged?.expense.title).toBe('夕食');
  });
});
