import { z } from 'zod';
import { PLACE_ADDRESS_MAX_LENGTH, PLACE_CATEGORIES } from '@/domain/types';
import { TRAVEL_MODES } from '@/domain/routing';
import { isValidISODate, isValidTime } from '@/lib/date';
import { isHttpUrl } from '@/lib/utils';

/**
 * Zod schemas are the single source of truth for what is allowed to be
 * persisted. Record types in `src/db/records.ts` are inferred from these.
 *
 * URL/date/time validation uses `.refine` with WHATWG primitives rather than
 * Zod's built-in string formats, to stay stable across Zod minor versions and
 * to express exactly the rules this product needs.
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
 * (missing / null both load as `null`) and with future JSON backups. A
 * whitespace-only value is normalised to `null`; the length cap is checked
 * after trimming.
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

/**
 * Optional travel-estimate fields (Phase 2.2). All are nullish so records and
 * JSON backups written before they existed still load; absent/blank values
 * normalise to `null`.
 */
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

export const placeCategorySchema = z.enum(PLACE_CATEGORIES);

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
    const autoFields = [
      place.travelMode,
      place.travelDistanceMeters,
      place.travelToPlaceId,
      place.travelRouteKey,
      place.travelCalculatedAt,
    ];

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
        place.travelMode != null ||
        place.travelDistanceMeters != null ||
        place.travelToPlaceId != null ||
        place.travelRouteKey != null ||
        place.travelCalculatedAt != null
      ) {
        ctx.addIssue({
          code: 'custom',
          message: '手入力の移動時間に自動見積もりの情報が混在しています',
          path: ['travelEstimateSource'],
        });
      }
      return;
    }

    if (autoFields.some((value) => value != null)) {
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
