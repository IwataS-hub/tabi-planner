import type { z } from 'zod';
import type {
  checklistItemRecordSchema,
  expenseRecordSchema,
  expenseShareRecordSchema,
  participantRecordSchema,
  placeRecordSchema,
  tripDayRecordSchema,
  tripRecordSchema,
} from '@/validation/schemas';

/**
 * Persistence record types — the exact shape stored in IndexedDB. They are
 * inferred from the Zod schemas so the validation rules and the stored shape
 * can never drift apart. UI code uses the domain types in `domain/types.ts`
 * instead; the repository layer maps between the two.
 */
export type TripRecord = z.infer<typeof tripRecordSchema>;
export type TripDayRecord = z.infer<typeof tripDayRecordSchema>;
export type PlaceRecord = z.infer<typeof placeRecordSchema>;
export type ParticipantRecord = z.infer<typeof participantRecordSchema>;
export type ExpenseRecord = z.infer<typeof expenseRecordSchema>;
export type ExpenseShareRecord = z.infer<typeof expenseShareRecordSchema>;
export type ChecklistItemRecord = z.infer<typeof checklistItemRecordSchema>;
