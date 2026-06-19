import { z } from 'zod';
import {
  EXPENSE_CATEGORIES,
  CHECKLIST_KINDS,
  PLACE_ADDRESS_MAX_LENGTH,
  PLACE_CATEGORIES,
  RESERVATION_KINDS,
  VISIT_STATUSES,
} from '@/domain/types';
import { TRAVEL_MODES } from '@/domain/routing';
import { isValidISODate, isValidTime } from '@/lib/date';
import { isHttpUrl } from '@/lib/utils';

/**
 * Zod schemas are the single source of truth for what is allowed to be
 * persisted. Record types in `src/db/records.ts` are inferred from these.
 */

const isoDate = z.string().refine(isValidISODate, '日付の形式が正しくありません (YYYY-MM-DD)');

const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'タイムスタンプが不正です');

const timeOfDay = z.string().refine(isValidTime, '時刻は HH:mm 形式で入力してください').nullable();

/** Allows an empty string (no URL) or a valid http(s) URL. */
const optionalUrl = z
  .string()
  .max(2048, 'URLが長すぎます')
  .refine(
    (value) => value === '' || isHttpUrl(value),
    'http(s):// から始まるURLを入力してください',
  );

const nonNegativeInt = z.number().int('整数で入力してください').min(0, '0以上で入力してください');

/**
 * Optional address. Backward compatible with records that never had the field
 * (missing / null both load as `null`) and with future JSON backups.
 */
const optionalAddress = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  })
  .pipe(
    z
      .string()
      .max(PLACE_ADDRESS_MAX_LENGTH, `住所は${PLACE_ADDRESS_MAX_LENGTH}文字以内で入力してください`)
      .nullable(),
  );

const nullableTrimmedString = z
  .string()
  .nullish()
  .transform((value) => {
    const trimmed = (value ?? '').trim();
    return trimmed === '' ? null : trimmed;
  })
  .pipe(z.string().nullable());

const travelModeField = z
  .enum(TRAVEL_MODES)
  .nullish()
  .transform((value) => value ?? null);

const travelEstimateSourceField = z
  .enum(['auto', 'manual'])
  .nullish()
  .transform((value) => value ?? null);

const travelDistanceField = z
  .number()
  .int('整数で入力してください')
  .min(0, '0以上で入力してください')
  .nullish()
  .transform((value) => value ?? null);

const nullableIsoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'タイムスタンプが不正です')
  .nullish()
  .transform((value) => value ?? null);

const nullableIsoDate = isoDate.nullish().transform((value) => value ?? null);

export const placeCategorySchema = z.enum(PLACE_CATEGORIES);
export const visitStatusSchema = z.enum(VISIT_STATUSES);
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export const checklistKindSchema = z.enum(CHECKLIST_KINDS);
export const reservationKindSchema = z.enum(RESERVATION_KINDS);

// ---------------------------------------------------------------------------
// Persistence record schemas
// ---------------------------------------------------------------------------

export const tripRecordSchema = z
  .object({
    id: z.string().min(1),
    title: z
      .string()
      .min(1, '旅行名を入力してください')
      .max(80, '旅行名は80文字以内で入力してください'),
    description: z.string().max(400, '概要は400文字以内で入力してください'),
    startDate: isoDate,
    endDate: isoDate,
    /** Optional trip-level budget in integer yen. Nullish for backward compat. */
    budgetYen: nonNegativeInt
      .max(1_000_000_000, '予算が大きすぎます')
      .nullish()
      .transform((v) => v ?? null),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    schemaVersion: z.number().int().min(1),
  })
  .refine((trip) => trip.startDate <= trip.endDate, {
    message: '終了日は開始日以降にしてください',
    path: ['endDate'],
  });

export const tripDayRecordSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  date: isoDate,
  order: nonNegativeInt,
});

export const placeRecordSchema = z
  .object({
    id: z.string().min(1),
    tripId: z.string().min(1),
    dayId: z.string().min(1),
    name: z
      .string()
      .min(1, '名称を入力してください')
      .max(120, '名称は120文字以内で入力してください'),
    category: placeCategorySchema,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: optionalAddress,
    startTime: timeOfDay,
    stayMinutes: nonNegativeInt.max(1440, '滞在時間が長すぎます').nullable(),
    travelMinutes: nonNegativeInt.max(1440, '移動時間が長すぎます').nullable(),
    memo: z.string().max(2000, 'メモは2000文字以内で入力してください'),
    url: optionalUrl,
    estimatedCost: nonNegativeInt.max(100_000_000, '金額が大きすぎます').nullable(),
    /** Nullish for backward compat with records written before Phase 2.3. */
    visitStatus: visitStatusSchema.nullish().transform((v) => v ?? null),
    travelMode: travelModeField,
    travelDistanceMeters: travelDistanceField,
    travelEstimateSource: travelEstimateSourceField,
    travelToPlaceId: nullableTrimmedString,
    travelRouteKey: nullableTrimmedString,
    travelCalculatedAt: nullableIsoTimestamp,
    order: nonNegativeInt,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .superRefine((place, ctx) => {
    const autoOnlyFields = [
      place.travelDistanceMeters,
      place.travelToPlaceId,
      place.travelRouteKey,
      place.travelCalculatedAt,
    ];
    const hasNonTransitMode = place.travelMode != null && place.travelMode !== 'transit';

    if (place.travelEstimateSource === 'auto') {
      if (
        place.travelMinutes == null ||
        place.travelMinutes <= 0 ||
        place.travelMode == null ||
        place.travelDistanceMeters == null ||
        place.travelToPlaceId == null ||
        place.travelRouteKey == null ||
        place.travelCalculatedAt == null
      ) {
        ctx.addIssue({
          code: 'custom',
          message: '自動移動見積もりの保存状態が不完全です',
          path: ['travelEstimateSource'],
        });
      }
      return;
    }

    if (place.travelEstimateSource === 'manual') {
      if (
        place.travelMinutes == null ||
        hasNonTransitMode ||
        autoOnlyFields.some((v) => v != null)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: '手入力の移動時間に自動見積もりの情報が混在しています',
          path: ['travelEstimateSource'],
        });
      }
      return;
    }

    if (hasNonTransitMode || autoOnlyFields.some((value) => value != null)) {
      ctx.addIssue({
        code: 'custom',
        message: '未設定の移動時間に自動見積もりの情報が残っています',
        path: ['travelEstimateSource'],
      });
    }
  })
  .transform((place) =>
    place.travelEstimateSource === null && place.travelMinutes != null
      ? { ...place, travelEstimateSource: 'manual' as const }
      : place,
  );

// ---------------------------------------------------------------------------
// Phase 2.3 record schemas
// ---------------------------------------------------------------------------

export const participantRecordSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  name: z
    .string()
    .min(1, '参加者名を入力してください')
    .max(60, '参加者名は60文字以内で入力してください'),
  order: nonNegativeInt,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const expenseRecordSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  dayId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  placeId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  title: z
    .string()
    .min(1, '費用の名称を入力してください')
    .max(120, '費用の名称は120文字以内で入力してください'),
  amountYen: nonNegativeInt.max(100_000_000, '金額が大きすぎます'),
  category: expenseCategorySchema,
  payerId: z.string().min(1),
  occurredAt: nullableIsoDate,
  memo: z.string().max(1000, 'メモは1000文字以内で入力してください'),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const expenseShareRecordSchema = z.object({
  id: z.string().min(1),
  expenseId: z.string().min(1),
  participantId: z.string().min(1),
  amountYen: nonNegativeInt.max(100_000_000, '金額が大きすぎます'),
});

export const checklistItemRecordSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  kind: checklistKindSchema,
  title: z
    .string()
    .min(1, 'タイトルを入力してください')
    .max(120, 'タイトルは120文字以内で入力してください'),
  completed: z.boolean(),
  assigneeId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  dueAt: nullableIsoDate,
  category: z.string().max(60, 'カテゴリは60文字以内で入力してください'),
  order: nonNegativeInt,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

// ---------------------------------------------------------------------------
// Phase 2.4 record schemas
// ---------------------------------------------------------------------------

export const candidatePlaceRecordSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  name: z.string().min(1, '名称を入力してください').max(120, '名称は120文字以内で入力してください'),
  category: placeCategorySchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: optionalAddress,
  startTime: timeOfDay,
  stayMinutes: nonNegativeInt.max(1440, '滞在時間が長すぎます').nullable(),
  memo: z.string().max(2000, 'メモは2000文字以内で入力してください'),
  url: optionalUrl,
  estimatedCost: nonNegativeInt.max(100_000_000, '金額が大きすぎます').nullable(),
  visitStatus: visitStatusSchema.nullish().transform((v) => v ?? ('planned' as const)),
  order: nonNegativeInt,
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export const reservationRecordSchema = z.object({
  id: z.string().min(1),
  tripId: z.string().min(1),
  dayId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  placeId: z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null),
  kind: reservationKindSchema,
  title: z
    .string()
    .min(1, '予約名を入力してください')
    .max(120, '予約名は120文字以内で入力してください'),
  startAt: nullableIsoTimestamp,
  endAt: nullableIsoTimestamp,
  location: z.string().max(200, '場所は200文字以内で入力してください'),
  confirmationCode: z.string().max(100, '予約番号は100文字以内で入力してください'),
  url: optionalUrl,
  phone: z.string().max(30, '電話番号は30文字以内で入力してください'),
  memo: z.string().max(2000, 'メモは2000文字以内で入力してください'),
  isPrivate: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

// ---------------------------------------------------------------------------
// Form input schema (trip create / edit)
// ---------------------------------------------------------------------------

/** Maximum number of days a single trip may span (guards day auto-generation). */
export const MAX_TRIP_DAYS = 60;

export const tripFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, '旅行名を入力してください')
      .max(80, '旅行名は80文字以内で入力してください'),
    description: z.string().trim().max(400, '概要は400文字以内で入力してください'),
    startDate: z.string().refine(isValidISODate, '開始日を選択してください'),
    endDate: z.string().refine(isValidISODate, '終了日を選択してください'),
  })
  .superRefine((value, ctx) => {
    if (!isValidISODate(value.startDate) || !isValidISODate(value.endDate)) return;
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        message: '終了日は開始日以降にしてください',
        path: ['endDate'],
      });
      return;
    }
    const start = new Date(value.startDate).getTime();
    const end = new Date(value.endDate).getTime();
    const days = Math.round((end - start) / 86_400_000) + 1;
    if (days > MAX_TRIP_DAYS) {
      ctx.addIssue({
        code: 'custom',
        message: `旅行期間は最大${MAX_TRIP_DAYS}日までです`,
        path: ['endDate'],
      });
    }
  });

export type TripFormValues = z.infer<typeof tripFormSchema>;

/** Flatten Zod issues into a `{ field: message }` map for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
