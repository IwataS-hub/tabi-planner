/**
 * Date / number formatting utilities, all timezone-safe.
 *
 * Calendar dates are handled as `YYYY-MM-DD` strings and parsed into LOCAL
 * dates (never UTC) so a trip on "2026-06-16" never drifts to the 15th/17th
 * depending on the user's timezone.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True when `value` is a syntactically valid, real `YYYY-MM-DD` date. */
export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** True when `value` is a valid 24h `HH:mm` time. */
export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Format a local Date as `YYYY-MM-DD`. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` string into a local Date at midnight. */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Inclusive count of calendar days between two `YYYY-MM-DD` strings. */
export function dayCount(startDate: string, endDate: string): number {
  const start = parseISODate(startDate).getTime();
  const end = parseISODate(endDate).getTime();
  const diff = Math.round((end - start) / 86_400_000);
  return diff + 1;
}

/** Every `YYYY-MM-DD` from start to end inclusive (empty if start > end). */
export function eachDateInRange(startDate: string, endDate: string): string[] {
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) return [];
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  if (start > end) return [];
  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

const jaWeekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' });
const jaFull = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** e.g. "2026年6月16日(火)" */
export function formatJaDate(value: string): string {
  if (!isValidISODate(value)) return value;
  const date = parseISODate(value);
  return `${jaFull.format(date)}(${jaWeekday.format(date)})`;
}

/** e.g. "6/16(火)" */
export function formatJaDateShort(value: string): string {
  if (!isValidISODate(value)) return value;
  const date = parseISODate(value);
  return `${date.getMonth() + 1}/${date.getDate()}(${jaWeekday.format(date)})`;
}

/** e.g. "2026年6月16日(火) 〜 6月18日(木)" — drops the year on the end when equal. */
export function formatJaDateRange(startDate: string, endDate: string): string {
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return `${startDate} 〜 ${endDate}`;
  }
  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const startLabel = formatJaDate(startDate);
  if (startDate === endDate) return startLabel;
  const sameYear = start.getFullYear() === end.getFullYear();
  const endLabel = sameYear
    ? `${end.getMonth() + 1}月${end.getDate()}日(${jaWeekday.format(end)})`
    : formatJaDate(endDate);
  return `${startLabel} 〜 ${endLabel}`;
}

const jaDateTime = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Format an ISO timestamp as a Japanese date+time, e.g. "2026/6/16 21:30". */
export function formatJaDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return jaDateTime.format(date);
}

/** Relative-ish "最終更新" label: today shows time, otherwise the date. */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `今日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return formatJaDateTime(iso);
}

/** Format JPY, e.g. 1200 -> "¥1,200". */
export function formatYen(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** e.g. 90 -> "1時間30分", 45 -> "45分", 120 -> "2時間". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0分';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** Add minutes to an "HH:mm" string, returning a new "HH:mm" (wraps past 24h). */
export function addMinutesToTime(time: string, minutes: number): string | null {
  if (!isValidTime(time)) return null;
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
