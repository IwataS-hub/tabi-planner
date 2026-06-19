import { db } from '@/db/database';
import { checklistItemFromRecord } from '@/db/mappers';
import type { ChecklistItemRecord } from '@/db/records';
import type { ChecklistItem, ChecklistKind } from '@/domain/types';
import { createId } from '@/lib/utils';
import { checklistItemRecordSchema } from '@/validation/schemas';
import { nowIso, validateRecord } from './shared';

export interface ChecklistItemDraft {
  tripId: string;
  kind: ChecklistKind;
  title: string;
  assigneeId?: string | null;
  dueAt?: string | null;
  category?: string;
}

function toItem(record: ChecklistItemRecord): ChecklistItem {
  return checklistItemFromRecord(
    validateRecord(checklistItemRecordSchema, record, 'チェックリストデータ'),
  );
}

export const checklistItemRepository = {
  async listByTrip(tripId: string, kind?: ChecklistKind): Promise<ChecklistItem[]> {
    let records = await db.checklistItems.where('tripId').equals(tripId).sortBy('order');
    if (kind) records = records.filter((r) => r.kind === kind);
    return records.map(toItem);
  },

  async listIncomplete(tripId: string, kind?: ChecklistKind): Promise<ChecklistItem[]> {
    const all = await checklistItemRepository.listByTrip(tripId, kind);
    return all.filter((item) => !item.completed);
  },

  async get(id: string): Promise<ChecklistItem | undefined> {
    const record = await db.checklistItems.get(id);
    if (!record) return undefined;
    return toItem(record);
  },

  async add(draft: ChecklistItemDraft): Promise<ChecklistItem> {
    const now = nowIso();
    const count = await db.checklistItems.where('tripId').equals(draft.tripId).count();
    const record = validateRecord(
      checklistItemRecordSchema,
      {
        id: createId(),
        tripId: draft.tripId,
        kind: draft.kind,
        title: draft.title.trim(),
        completed: false,
        assigneeId: draft.assigneeId ?? null,
        dueAt: draft.dueAt ?? null,
        category: (draft.category ?? '').trim(),
        order: count,
        createdAt: now,
        updatedAt: now,
      },
      'チェックリスト項目の追加',
    );
    await db.checklistItems.add(record);
    return toItem(record);
  },

  async update(
    id: string,
    patch: Partial<Pick<ChecklistItem, 'title' | 'assigneeId' | 'dueAt' | 'category' | 'kind'>>,
  ): Promise<ChecklistItem> {
    const existing = await db.checklistItems.get(id);
    if (!existing) throw new Error(`チェックリスト項目が見つかりません: ${id}`);
    const record = validateRecord(
      checklistItemRecordSchema,
      {
        ...existing,
        ...patch,
        title: (patch.title ?? existing.title).trim(),
        category: ((patch.category ?? existing.category) || '').trim(),
        updatedAt: nowIso(),
      },
      'チェックリスト項目の更新',
    );
    await db.checklistItems.put(record);
    return toItem(record);
  },

  async setCompleted(id: string, completed: boolean): Promise<ChecklistItem> {
    const existing = await db.checklistItems.get(id);
    if (!existing) throw new Error(`チェックリスト項目が見つかりません: ${id}`);
    const record = { ...existing, completed, updatedAt: nowIso() };
    await db.checklistItems.put(record);
    return toItem(record);
  },

  async remove(id: string): Promise<void> {
    const existing = await db.checklistItems.get(id);
    if (!existing) return;
    await db.checklistItems.delete(id);
    // Re-pack order within the same trip+kind
    const remaining = await db.checklistItems
      .where('tripId')
      .equals(existing.tripId)
      .sortBy('order');
    const sameKind = remaining.filter((r) => r.kind === existing.kind);
    const updates = sameKind.map((r, index) => ({ ...r, order: index }));
    if (updates.length > 0) await db.checklistItems.bulkPut(updates);
  },

  async reorder(tripId: string, kind: ChecklistKind, orderedIds: string[]): Promise<void> {
    const records = await db.checklistItems.where('tripId').equals(tripId).toArray();
    const byId = new Map(records.map((r) => [r.id, r]));
    const updates: ChecklistItemRecord[] = [];
    orderedIds.forEach((id, index) => {
      const record = byId.get(id);
      if (record && record.kind === kind && record.order !== index) {
        updates.push({ ...record, order: index, updatedAt: nowIso() });
      }
    });
    if (updates.length > 0) await db.checklistItems.bulkPut(updates);
  },

  /**
   * Add items from weather-based suggestions. Skips titles that already exist
   * as incomplete items of the same kind, avoiding duplicates.
   */
  async addSuggestions(
    tripId: string,
    kind: ChecklistKind,
    suggestions: Array<{ title: string; category: string }>,
  ): Promise<ChecklistItem[]> {
    const existing = await checklistItemRepository.listIncomplete(tripId, kind);
    const existingTitles = new Set(existing.map((item) => item.title.toLowerCase()));
    const toAdd = suggestions.filter((s) => !existingTitles.has(s.title.toLowerCase()));
    const added: ChecklistItem[] = [];
    for (const s of toAdd) {
      const item = await checklistItemRepository.add({
        tripId,
        kind,
        title: s.title,
        category: s.category,
      });
      added.push(item);
    }
    return added;
  },
};
