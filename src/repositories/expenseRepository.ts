import { db } from '@/db/database';
import { expenseFromRecord, expenseShareFromRecord } from '@/db/mappers';
import type { ExpenseRecord, ExpenseShareRecord } from '@/db/records';
import type { Expense, ExpenseCategory, ExpenseShare } from '@/domain/types';
import { createId } from '@/lib/utils';
import { expenseRecordSchema, expenseShareRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export interface ShareInput {
  participantId: string;
  amountYen: number;
}

export interface ExpenseDraft {
  tripId: string;
  dayId: string | null;
  placeId: string | null;
  title: string;
  amountYen: number;
  category: ExpenseCategory;
  payerId: string;
  occurredAt: string | null;
  memo: string;
  shares: ShareInput[];
}

export interface ExpenseWithShares {
  expense: Expense;
  shares: ExpenseShare[];
}

function toExpense(record: ExpenseRecord): Expense {
  return expenseFromRecord(validateRecord(expenseRecordSchema, record, '費用データ'));
}

function toShare(record: ExpenseShareRecord): ExpenseShare {
  return expenseShareFromRecord(validateRecord(expenseShareRecordSchema, record, '費用分担データ'));
}

async function validateExpenseConstraints(
  draft: {
    amountYen: number;
    shares: ShareInput[];
    payerId: string;
    dayId: string | null;
    placeId: string | null;
  },
  tripId: string,
): Promise<void> {
  if (!Number.isInteger(draft.amountYen) || draft.amountYen < 0) {
    throw new Error('費用額は0以上の整数である必要があります');
  }
  if (draft.shares.length === 0) {
    throw new Error('費用の分担者が設定されていません');
  }
  const shareSum = draft.shares.reduce((sum, s) => sum + s.amountYen, 0);
  if (shareSum !== draft.amountYen) {
    throw new Error(`分担合計（${shareSum}円）が費用額（${draft.amountYen}円）と一致しません`);
  }
  const shareParticipantIds = draft.shares.map((s) => s.participantId);
  if (new Set(shareParticipantIds).size !== shareParticipantIds.length) {
    throw new Error('費用の分担者に重複があります');
  }

  const participants = await db.participants.where('tripId').equals(tripId).toArray();
  const participantIds = new Set(participants.map((p) => p.id));

  if (!participantIds.has(draft.payerId)) {
    throw new Error('費用の支払者が参加者として見つかりません');
  }
  for (const share of draft.shares) {
    if (!participantIds.has(share.participantId)) {
      throw new Error('費用の分担者が参加者として見つかりません');
    }
  }

  if (draft.dayId != null) {
    const day = await db.days.get(draft.dayId);
    if (!day || day.tripId !== tripId) {
      throw new Error('指定された日付が旅行に存在しません');
    }
  }

  if (draft.placeId != null) {
    const place = await db.places.get(draft.placeId);
    if (!place || place.tripId !== tripId) {
      throw new Error('指定されたスポットが旅行に存在しません');
    }
  }
}

function buildShareRecords(expenseId: string, shares: ShareInput[]): ExpenseShareRecord[] {
  return shares.map((s) =>
    validateRecord(
      expenseShareRecordSchema,
      { id: createId(), expenseId, participantId: s.participantId, amountYen: s.amountYen },
      '費用分担の作成',
    ),
  );
}

/**
 * Calculate equal split shares across participants with deterministic remainder
 * allocation by participant order then id.
 */
export function equalSplit(
  amountYen: number,
  participants: Array<{ id: string; order: number }>,
): ShareInput[] {
  if (participants.length === 0) return [];
  const sorted = [...participants].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const base = Math.floor(amountYen / sorted.length);
  const remainder = amountYen - base * sorted.length;
  return sorted.map((p, index) => ({
    participantId: p.id,
    amountYen: base + (index < remainder ? 1 : 0),
  }));
}

export const expenseRepository = {
  async listByTrip(tripId: string): Promise<ExpenseWithShares[]> {
    const expenses = await db.expenses.where('tripId').equals(tripId).toArray();
    const expenseIds = expenses.map((e) => e.id);
    const allShares =
      expenseIds.length > 0
        ? await db.expenseShares.where('expenseId').anyOf(expenseIds).toArray()
        : [];
    const sharesByExpense = new Map<string, ExpenseShareRecord[]>();
    for (const share of allShares) {
      const list = sharesByExpense.get(share.expenseId) ?? [];
      list.push(share);
      sharesByExpense.set(share.expenseId, list);
    }
    return expenses
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((e) => ({
        expense: toExpense(e),
        shares: (sharesByExpense.get(e.id) ?? []).map(toShare),
      }));
  },

  async get(id: string): Promise<ExpenseWithShares | undefined> {
    const record = await db.expenses.get(id);
    if (!record) return undefined;
    const shares = await db.expenseShares.where('expenseId').equals(id).toArray();
    return { expense: toExpense(record), shares: shares.map(toShare) };
  },

  /** Add an expense and its shares atomically. */
  async add(draft: ExpenseDraft): Promise<ExpenseWithShares> {
    const now = nowIso();
    const id = createId();
    let expenseRecord: ExpenseRecord | undefined;
    let shareRecords: ExpenseShareRecord[] = [];
    await db.transaction(
      'rw',
      [db.expenses, db.expenseShares, db.participants, db.days, db.places],
      async () => {
        await validateExpenseConstraints(draft, draft.tripId);
        expenseRecord = validateRecord(
          expenseRecordSchema,
          {
            id,
            tripId: draft.tripId,
            dayId: draft.dayId,
            placeId: draft.placeId,
            title: draft.title.trim(),
            amountYen: draft.amountYen,
            category: draft.category,
            payerId: draft.payerId,
            occurredAt: draft.occurredAt,
            memo: draft.memo,
            createdAt: now,
            updatedAt: now,
          },
          '費用の追加',
        );
        shareRecords = buildShareRecords(id, draft.shares);
        await db.expenses.add(expenseRecord);
        if (shareRecords.length > 0) await db.expenseShares.bulkAdd(shareRecords);
      },
    );
    if (!expenseRecord) throw new Error('費用の追加に失敗しました');
    return { expense: toExpense(expenseRecord), shares: shareRecords.map(toShare) };
  },

  /** Update expense and replace its shares atomically. */
  async update(id: string, patch: Omit<ExpenseDraft, 'tripId'>): Promise<ExpenseWithShares> {
    let saved: ExpenseRecord | undefined;
    let savedShares: ExpenseShareRecord[] = [];
    await db.transaction(
      'rw',
      [db.expenses, db.expenseShares, db.participants, db.days, db.places],
      async () => {
        const existing = await db.expenses.get(id);
        if (!existing) throw new Error(`費用が見つかりません: ${id}`);
        await validateExpenseConstraints(patch, existing.tripId);
        saved = validateRecord(
          expenseRecordSchema,
          {
            ...existing,
            dayId: patch.dayId,
            placeId: patch.placeId,
            title: patch.title.trim(),
            amountYen: patch.amountYen,
            category: patch.category,
            payerId: patch.payerId,
            occurredAt: patch.occurredAt,
            memo: patch.memo,
            updatedAt: nowIso(),
          },
          '費用の更新',
        );
        await db.expenses.put(saved);
        await db.expenseShares.where('expenseId').equals(id).delete();
        savedShares = buildShareRecords(id, patch.shares);
        if (savedShares.length > 0) await db.expenseShares.bulkAdd(savedShares);
      },
    );
    if (!saved) throw new Error('費用の更新に失敗しました');
    return { expense: toExpense(saved), shares: savedShares.map(toShare) };
  },

  /** Remove an expense and its shares atomically. */
  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.expenses, db.expenseShares, async () => {
      await db.expenseShares.where('expenseId').equals(id).delete();
      await db.expenses.delete(id);
    });
  },
};
