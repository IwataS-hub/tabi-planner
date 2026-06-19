import type { Place, Reservation, Trip, TripDay } from './types';
import type { TimelineEntry } from './timeline';

const TIMEZONE = 'Asia/Tokyo';

/**
 * Format a Date as a local-time iCalendar DTSTART/DTEND value for Asia/Tokyo.
 * Uses the TZID form: DTSTART;TZID=Asia/Tokyo:YYYYMMDDTHHmmss
 */
function formatIcsDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const tokyoDate = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
  return (
    `${tokyoDate.getFullYear()}` +
    `${pad(tokyoDate.getMonth() + 1)}` +
    `${pad(tokyoDate.getDate())}` +
    `T${pad(tokyoDate.getHours())}` +
    `${pad(tokyoDate.getMinutes())}` +
    `${pad(tokyoDate.getSeconds())}`
  );
}

/** Format a YYYY-MM-DD + HH:mm pair as a Date, assuming Asia/Tokyo. */
function parseLocalDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

/** Escape special characters in iCalendar text fields. */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/** Fold long lines per RFC 5545 (max 75 octets, continuation with CRLF + space). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  while (start < line.length) {
    parts.push(line.slice(start, start + 75));
    start += 75;
  }
  return parts.join('\r\n ');
}

function prop(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function propTz(name: string, value: string): string {
  return foldLine(`${name};TZID=${TIMEZONE}:${value}`);
}

interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  dtstart: string;
  dtend: string;
  tzid: boolean;
}

function renderEvent(ev: IcsEvent): string {
  const lines: string[] = [
    'BEGIN:VEVENT',
    prop('UID', ev.uid),
    prop('SUMMARY', escapeIcs(ev.summary)),
  ];
  if (ev.description) lines.push(prop('DESCRIPTION', escapeIcs(ev.description)));
  if (ev.location) lines.push(prop('LOCATION', escapeIcs(ev.location)));
  if (ev.url) lines.push(prop('URL', ev.url));
  if (ev.tzid) {
    lines.push(propTz('DTSTART', ev.dtstart));
    lines.push(propTz('DTEND', ev.dtend));
  } else {
    lines.push(prop('DTSTART', ev.dtstart));
    lines.push(prop('DTEND', ev.dtend));
  }
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * Generate an iCalendar (.ics) string for a trip.
 *
 * Includes:
 * - Places with a computed or explicit arrival time (from timelineByDay)
 * - Reservations with startAt set
 *
 * Excludes: confirmationCode (never included per spec).
 */
export function generateIcs(
  trip: Trip,
  days: TripDay[],
  placesByDay: Record<string, Place[]>,
  timelineByDay: Record<string, TimelineEntry[]>,
  reservations: Reservation[],
): string {
  const events: IcsEvent[] = [];

  // ── Place events ────────────────────────────────────────────────────────
  for (const day of days) {
    const places = placesByDay[day.id] ?? [];
    const timeline = timelineByDay[day.id] ?? [];
    const timeByPlaceId = new Map(timeline.map((e) => [e.placeId, e]));

    for (const place of places) {
      const entry = timeByPlaceId.get(place.id);
      const arrivalTime = entry?.arrivalTime ?? place.startTime;
      if (!arrivalTime) continue;

      const start = parseLocalDateTime(day.date, arrivalTime);
      const durationMin = place.stayMinutes ?? 60;
      const end = new Date(start.getTime() + durationMin * 60_000);

      const descParts: string[] = [];
      if (place.address) descParts.push(place.address);
      if (place.memo) descParts.push(place.memo);
      if (place.url) descParts.push(place.url);

      events.push({
        uid: `place-${place.id}@tabiori`,
        summary: place.name,
        description: descParts.join('\n') || undefined,
        location: place.address ?? undefined,
        url: place.url || undefined,
        dtstart: formatIcsDateTime(start),
        dtend: formatIcsDateTime(end),
        tzid: true,
      });
    }
  }

  // ── Reservation events ──────────────────────────────────────────────────
  for (const res of reservations) {
    if (!res.startAt) continue;
    const startDate = new Date(res.startAt);
    if (Number.isNaN(startDate.getTime())) continue;

    let endDate: Date;
    if (res.endAt) {
      const candidate = new Date(res.endAt);
      endDate = Number.isNaN(candidate.getTime())
        ? new Date(startDate.getTime() + 3_600_000)
        : candidate;
    } else {
      endDate = new Date(startDate.getTime() + 3_600_000);
    }

    const descParts: string[] = [];
    if (res.location) descParts.push(res.location);
    if (res.phone) descParts.push(`Tel: ${res.phone}`);
    if (res.memo) descParts.push(res.memo);

    events.push({
      uid: `reservation-${res.id}@tabiori`,
      summary: res.title,
      description: descParts.join('\n') || undefined,
      location: res.location || undefined,
      url: res.url || undefined,
      dtstart: formatIcsDateTime(startDate),
      dtend: formatIcsDateTime(endDate),
      tzid: true,
    });
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    prop('VERSION', '2.0'),
    prop('PRODID', '-//Tabiori//Tabiori//JA'),
    prop('CALSCALE', 'GREGORIAN'),
    prop('X-WR-CALNAME', escapeIcs(trip.title)),
    prop('X-WR-TIMEZONE', TIMEZONE),
    // Inline VTIMEZONE for Asia/Tokyo (JST, UTC+9, no DST)
    'BEGIN:VTIMEZONE',
    prop('TZID', TIMEZONE),
    'BEGIN:STANDARD',
    prop('TZOFFSETFROM', '+0900'),
    prop('TZOFFSETTO', '+0900'),
    prop('TZNAME', 'JST'),
    prop('DTSTART', '19700101T000000'),
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events.map(renderEvent),
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}
