import { db } from '@/db/database';
import { participantFromRecord } from '@/db/mappers';
import type { ParticipantRecord } from '@/db/records';
import type { Participant } from '@/domain/types';
import { createId } from '@/lib/utils';
import { participantRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export interface ParticipantDraft {
  tripId: string;
  name: string;
}

function toParticipant(record: ParticipantRecord): Participant {
  return participantFromRecord(validateRecord(participantRecordSchema, record, '参加者データ'));
}

export const participantRepository = {
  async listByTrip(tripId: string): Promise<Participant[]> {
    const records = await db.participants
      .where('tripId')
      .equals(tripId)
      .sortBy('order');
    return records.map(toParticipant);
  },

  async get(id: string): Promise<Participant | undefined> {
    const record = await db.participants.get(id);
    if (!record) return undefined;
    return toParticipant(record);
  },

  async add(draft: ParticipantDraft): Promise<Participant> {
    const now = nowIso();
    const count = await db.participants.where('tripId').equals(draft.tripId).count();
    const record = validateRecord(
      participantRecordSchema,
      {
        id: createId(),
        tripId: draft.tripId,
        name: draft.name.trim(),
        order: count,
        createdAt: now,
        updatedAt: now,
      },
      '参加者の追加',
    );
    await db.participants.add(record);
    return toParticipant(record);
  },

  async update(id: string, name: string): Promise<Participant> {
    const existing = await db.participants.get(id);
    if (!existing) throw new Error(`参加者が見つかりません: ${id}`);
    const record = validateRecord(
      participantRecordSchema,
      { ...existing, name: name.trim(), updatedAt: nowIso() },
      '参加者の更新',
    );
    await db.participants.put(record);
    return toParticipant(record);
  },

  /**
   * Delete a participant only when they are not referenced by any expense or
   * expense share. Throws if any reference exists.
   */
  async remove(id: string): Promise<void> {
    const [expenseCount, shareCount, checklistCount] = await Promise.all([
      db.expenses.where('payerId').equals(id).count(),
      db.expenseShares.where('participantId').equals(id).count(),
      db.checklistItems.where('tripId').above('').count().then(async () => {
        // Check for checklist items assigned to this participant
        const items = await db.checklistItems.toArray();
        return items.filter((item) => item.assigneeId === id).length;
      }),
    ]);
    if (expenseCount > 0 || shareCount > 0) {
      throw new Error('この参加者は費用データで参照されているため削除できません');
    }
    // Checklist assignee references are soft (not blocking); clear them on delete
    if (checklistCount > 0) {
      const items = await db.checklistItems.toArray();
      const toUpdate = items.filter((item) => item.assigneeId === id);
      await db.checklistItems.bulkPut(
        toUpdate.map((item) => ({ ...item, assigneeId: null, updatedAt: nowIso() })),
      );
    }
    await db.participants.delete(id);
  },

  async reorder(tripId: string, orderedIds: string[]): Promise<void> {
    const records = await db.participants.where('tripId').equals(tripId).toArray();
    const byId = new Map(records.map((r) => [r.id, r]));
    const updates: ParticipantRecord[] = [];
    orderedIds.forEach((id, index) => {
      const record = byId.get(id);
      if (record && record.order !== index) {
        updates.push({ ...record, order: index, updatedAt: nowIso() });
      }
    });
    if (updates.length > 0) await db.participants.bulkPut(updates);
  },
};
