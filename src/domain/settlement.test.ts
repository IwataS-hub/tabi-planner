import { describe, expect, it } from 'vitest';
import {
  computeBalances,
  computeSettlement,
  computeBudgetSummary,
  summarizeByCategory,
  summarizeByDay,
} from './settlement';
import { equalSplit } from '@/repositories/expenseRepository';
import type { Expense, ExpenseShare, Participant } from './types';

function makeParticipant(id: string, name: string): Participant {
  return { id, tripId: 'trip1', name, order: 0, createdAt: '', updatedAt: '' };
}

function makeExpense(overrides: Partial<Expense> & { id: string }): Expense {
  return {
    tripId: 'trip1',
    dayId: null,
    placeId: null,
    payerId: 'p1',
    title: 'Test',
    amountYen: 1000,
    category: 'other',
    occurredAt: null,
    memo: '',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function makeShare(expenseId: string, participantId: string, amountYen: number): ExpenseShare {
  return { id: `${expenseId}-${participantId}`, expenseId, participantId, amountYen, createdAt: '', updatedAt: '' };
}

const p1 = makeParticipant('p1', 'Alice');
const p2 = makeParticipant('p2', 'Bob');
const p3 = makeParticipant('p3', 'Carol');

describe('computeBalances', () => {
  it('zero balances with no expenses', () => {
    const balances = computeBalances([p1, p2], [], []);
    expect(balances).toHaveLength(2);
    expect(balances.every((b) => b.balance === 0)).toBe(true);
  });

  it('single expense paid by p1, split equally', () => {
    const expense = makeExpense({ id: 'e1', payerId: 'p1', amountYen: 900 });
    const shares = [makeShare('e1', 'p1', 300), makeShare('e1', 'p2', 300), makeShare('e1', 'p3', 300)];
    const balances = computeBalances([p1, p2, p3], [expense], shares);
    const alice = balances.find((b) => b.participantId === 'p1')!;
    const bob = balances.find((b) => b.participantId === 'p2')!;
    const carol = balances.find((b) => b.participantId === 'p3')!;
    expect(alice.balance).toBe(600);  // paid 900, owes 300 → +600
    expect(bob.balance).toBe(-300);
    expect(carol.balance).toBe(-300);
  });
});

describe('computeSettlement', () => {
  it('returns empty for zero balances', () => {
    const balances = [
      { participantId: 'p1', participantName: 'Alice', balance: 0 },
      { participantId: 'p2', participantName: 'Bob', balance: 0 },
    ];
    expect(computeSettlement(balances)).toHaveLength(0);
  });

  it('produces correct transfer for two people', () => {
    const expense = makeExpense({ id: 'e1', payerId: 'p1', amountYen: 2000 });
    const shares = [makeShare('e1', 'p1', 1000), makeShare('e1', 'p2', 1000)];
    const balances = computeBalances([p1, p2], [expense], shares);
    const settlement = computeSettlement(balances);
    expect(settlement).toHaveLength(1);
    expect(settlement[0].fromName).toBe('Bob');
    expect(settlement[0].toName).toBe('Alice');
    expect(settlement[0].amountYen).toBe(1000);
  });

  it('handles three-person split correctly', () => {
    // Alice paid 900, equal split among 3 → bob and carol owe 300 each
    const expense = makeExpense({ id: 'e1', payerId: 'p1', amountYen: 900 });
    const shares = [makeShare('e1', 'p1', 300), makeShare('e1', 'p2', 300), makeShare('e1', 'p3', 300)];
    const balances = computeBalances([p1, p2, p3], [expense], shares);
    const settlement = computeSettlement(balances);
    expect(settlement).toHaveLength(2);
    const total = settlement.reduce((sum, t) => sum + t.amountYen, 0);
    expect(total).toBe(600); // alice receives 300+300
  });

  it('net-zero with cross payments', () => {
    // Alice pays 1200 for p1+p2+p3 (400 each); Bob pays 600 for p1+p2+p3 (200 each)
    const e1 = makeExpense({ id: 'e1', payerId: 'p1', amountYen: 1200 });
    const e2 = makeExpense({ id: 'e2', payerId: 'p2', amountYen: 600 });
    const shares = [
      makeShare('e1', 'p1', 400), makeShare('e1', 'p2', 400), makeShare('e1', 'p3', 400),
      makeShare('e2', 'p1', 200), makeShare('e2', 'p2', 200), makeShare('e2', 'p3', 200),
    ];
    const balances = computeBalances([p1, p2, p3], [e1, e2], shares);
    const settlement = computeSettlement(balances);
    // total transfers should balance to zero
    const creditors = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0);
    const debtors = balances.filter((b) => b.balance < 0).reduce((s, b) => s + b.balance, 0);
    expect(creditors + debtors).toBe(0);
    // all transfers go to creditors
    const totalTransferred = settlement.reduce((s, t) => s + t.amountYen, 0);
    expect(totalTransferred).toBe(creditors);
  });
});

describe('computeBudgetSummary', () => {
  const expenses = [
    makeExpense({ id: 'e1', amountYen: 3000 }),
    makeExpense({ id: 'e2', amountYen: 2000 }),
  ];

  it('calculates total spent', () => {
    const summary = computeBudgetSummary(null, expenses);
    expect(summary.spentYen).toBe(5000);
    expect(summary.remainingYen).toBeNull();
    expect(summary.overBudget).toBe(false);
  });

  it('calculates remaining when under budget', () => {
    const summary = computeBudgetSummary(10000, expenses);
    expect(summary.spentYen).toBe(5000);
    expect(summary.remainingYen).toBe(5000);
    expect(summary.overBudget).toBe(false);
  });

  it('flags overBudget', () => {
    const summary = computeBudgetSummary(4000, expenses);
    expect(summary.overBudget).toBe(true);
    expect(summary.remainingYen).toBe(-1000);
  });
});

describe('summarizeByCategory', () => {
  it('groups and sums by category', () => {
    const expenses = [
      makeExpense({ id: 'e1', category: 'food', amountYen: 2000 }),
      makeExpense({ id: 'e2', category: 'food', amountYen: 1000 }),
      makeExpense({ id: 'e3', category: 'transport', amountYen: 500 }),
    ];
    const summaries = summarizeByCategory(expenses);
    const food = summaries.find((s) => s.category === 'food');
    const transport = summaries.find((s) => s.category === 'transport');
    expect(food?.totalYen).toBe(3000);
    expect(transport?.totalYen).toBe(500);
  });

  it('returns empty array for no expenses', () => {
    expect(summarizeByCategory([])).toHaveLength(0);
  });
});

describe('summarizeByDay', () => {
  it('groups by dayId', () => {
    const expenses = [
      makeExpense({ id: 'e1', dayId: 'day1', amountYen: 1000 }),
      makeExpense({ id: 'e2', dayId: 'day1', amountYen: 500 }),
      makeExpense({ id: 'e3', dayId: 'day2', amountYen: 2000 }),
      makeExpense({ id: 'e4', dayId: null, amountYen: 300 }),
    ];
    const summaries = summarizeByDay(expenses);
    const day1 = summaries.find((s) => s.dayId === 'day1');
    expect(day1?.totalYen).toBe(1500);
  });
});

describe('equalSplit', () => {
  it('splits evenly when divisible', () => {
    const result = equalSplit(900, [p1, p2, p3]);
    expect(result.every((s) => s.amountYen === 300)).toBe(true);
  });

  it('allocates remainder to first participant by order then id', () => {
    const result = equalSplit(1000, [p1, p2, p3]);
    const total = result.reduce((s, r) => s + r.amountYen, 0);
    expect(total).toBe(1000);
    // Some share should be 334, rest 333
    const counts = new Map<number, number>();
    for (const r of result) {
      counts.set(r.amountYen, (counts.get(r.amountYen) ?? 0) + 1);
    }
    expect(counts.get(334)).toBe(1);
    expect(counts.get(333)).toBe(2);
  });

  it('returns empty for zero participants', () => {
    expect(equalSplit(1000, [])).toHaveLength(0);
  });
});
