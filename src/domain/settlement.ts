import type { Expense, ExpenseShare, Participant } from './types';

/** Per-participant financial summary. */
export interface ParticipantBalance {
  participantId: string;
  name: string;
  paid: number;
  owed: number;
  /** paid - owed. Positive: owed money by others. Negative: owes money. */
  balance: number;
}

/** A single suggested transfer to settle up. */
export interface Transfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amountYen: number;
}

export interface BudgetSummary {
  budgetYen: number | null;
  spentYen: number;
  remainingYen: number | null;
  overBudget: boolean;
}

export interface CategorySummary {
  category: string;
  totalYen: number;
}

/** Compute paid/owed/balance per participant from expenses and shares. */
export function computeBalances(
  participants: Participant[],
  expenses: Expense[],
  shares: ExpenseShare[],
): ParticipantBalance[] {
  const paid = new Map<string, number>();
  const owed = new Map<string, number>();

  for (const p of participants) {
    paid.set(p.id, 0);
    owed.set(p.id, 0);
  }

  for (const e of expenses) {
    if (paid.has(e.payerId)) {
      paid.set(e.payerId, (paid.get(e.payerId) ?? 0) + e.amountYen);
    }
  }

  for (const s of shares) {
    if (owed.has(s.participantId)) {
      owed.set(s.participantId, (owed.get(s.participantId) ?? 0) + s.amountYen);
    }
  }

  return participants.map((p) => {
    const paidAmt = paid.get(p.id) ?? 0;
    const owedAmt = owed.get(p.id) ?? 0;
    return {
      participantId: p.id,
      name: p.name,
      paid: paidAmt,
      owed: owedAmt,
      balance: paidAmt - owedAmt,
    };
  });
}

/**
 * Greedy settlement suggestions. Repeatedly match the largest creditor with
 * the largest debtor until all balances are zero. No zero or self-transfers
 * are emitted. Deterministic: ties are broken by participantId.
 */
export function computeSettlement(balances: ParticipantBalance[]): Transfer[] {
  const nameById = new Map(balances.map((b) => [b.participantId, b.name]));
  // Work with integer cent precision (yen is already integer, so no conversion needed)
  const credits: Array<{ id: string; amount: number }> = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ id: b.participantId, amount: b.balance }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  const debts: Array<{ id: string; amount: number }> = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ id: b.participantId, amount: -b.balance }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];

  let ci = 0;
  let di = 0;
  while (ci < credits.length && di < debts.length) {
    const credit = credits[ci];
    const debt = debts[di];
    const amount = Math.min(credit.amount, debt.amount);
    if (amount > 0) {
      transfers.push({
        fromId: debt.id,
        fromName: nameById.get(debt.id) ?? debt.id,
        toId: credit.id,
        toName: nameById.get(credit.id) ?? credit.id,
        amountYen: amount,
      });
    }
    credit.amount -= amount;
    debt.amount -= amount;
    if (credit.amount === 0) ci += 1;
    if (debt.amount === 0) di += 1;
  }

  return transfers;
}

/** Total spent = sum of all expense amounts. */
export function computeBudgetSummary(budgetYen: number | null, expenses: Expense[]): BudgetSummary {
  const spentYen = expenses.reduce((sum, e) => sum + e.amountYen, 0);
  const remainingYen = budgetYen != null ? budgetYen - spentYen : null;
  return {
    budgetYen,
    spentYen,
    remainingYen,
    overBudget: budgetYen != null && spentYen > budgetYen,
  };
}

/** Expense totals grouped by category. */
export function summarizeByCategory(expenses: Expense[]): CategorySummary[] {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    totals.set(e.category, (totals.get(e.category) ?? 0) + e.amountYen);
  }
  return [...totals.entries()]
    .map(([category, totalYen]) => ({ category, totalYen }))
    .sort((a, b) => b.totalYen - a.totalYen);
}

/** Expense totals grouped by day. */
export function summarizeByDay(expenses: Expense[]): Array<{ dayId: string; totalYen: number }> {
  const totals = new Map<string, number>();
  for (const e of expenses) {
    if (e.dayId) {
      totals.set(e.dayId, (totals.get(e.dayId) ?? 0) + e.amountYen);
    }
  }
  return [...totals.entries()].map(([dayId, totalYen]) => ({ dayId, totalYen }));
}
