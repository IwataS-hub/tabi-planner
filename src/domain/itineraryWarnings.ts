import type { CandidatePlace, Place, Reservation, TripDay } from './types';
import type { TimelineEntry } from './timeline';

export type WarningLevel = 'warning' | 'caution' | 'info';

export interface ItineraryWarning {
  /** Stable id for React key. */
  id: string;
  level: WarningLevel;
  /** null means the warning applies to the whole trip. */
  dayId: string | null;
  message: string;
}

export interface WarningContext {
  trip: { budgetYen: number | null };
  days: TripDay[];
  placesByDay: Record<string, Place[]>;
  timelineByDay: Record<string, TimelineEntry[]>;
  reservations: Reservation[];
  candidatePlaces: CandidatePlace[];
  /** Total spent in integer yen, or null to skip budget warnings. */
  totalSpentYen: number | null;
  /** Weather code per day date (WMO), or null when unavailable. */
  weatherCodeByDate?: Record<string, number | null>;
  /** Sunset time "HH:mm" per day date, or undefined when unavailable. */
  sunsetByDate?: Record<string, string | undefined>;
}

const OUTDOOR_CATEGORIES = new Set(['sightseeing', 'other']);
const RAINY_WMO_CODES = new Set([51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99]);

function minutesFromTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Compute smart itinerary warnings. Pure function — no side effects.
 * All warnings are informational; no changes to the itinerary are made.
 */
export function computeWarnings(ctx: WarningContext): ItineraryWarning[] {
  const warnings: ItineraryWarning[] = [];
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${seq++}`;

  // ─── Per-day warnings ────────────────────────────────────────────────────
  for (const day of ctx.days) {
    const places = ctx.placesByDay[day.id] ?? [];
    const timeline = ctx.timelineByDay[day.id] ?? [];
    const dayReservations = ctx.reservations.filter((r) => r.dayId === day.id);

    // 1. Travel time missing between consecutive places
    for (let i = 0; i < places.length - 1; i++) {
      if (places[i].travelMinutes == null) {
        warnings.push({
          id: id('no-travel'),
          level: 'info',
          dayId: day.id,
          message: `「${places[i].name}」から次のスポットへの移動時間が未入力です。`,
        });
        break; // one warning per day is enough
      }
    }

    // 2. Day too packed (> 10h scheduled activities)
    const totalStay = places.reduce((sum, p) => sum + (p.stayMinutes ?? 0), 0);
    const totalTravel = places.reduce((sum, p) => sum + (p.travelMinutes ?? 0), 0);
    if (totalStay + totalTravel > 600) {
      warnings.push({
        id: id('too-packed'),
        level: 'caution',
        dayId: day.id,
        message: `1日の滞在+移動時間が${Math.round((totalStay + totalTravel) / 60)}時間を超えています。スケジュールが詰まりすぎかもしれません。`,
      });
    }

    // 3. Total travel time too long (> 3h/day)
    if (totalTravel > 180) {
      warnings.push({
        id: id('long-travel'),
        level: 'caution',
        dayId: day.id,
        message: `移動時間の合計が${Math.round(totalTravel / 60)}時間を超えています。`,
      });
    }

    // 4. Schedule overlap: two timed entries that conflict
    const timedPlaces = timeline.filter((e) => e.arrivalTime != null && !e.isEstimated);
    for (let i = 0; i < timedPlaces.length - 1; i++) {
      const a = timedPlaces[i];
      const b = timedPlaces[i + 1];
      if (a.departureTime && b.arrivalTime) {
        const depMin = minutesFromTime(a.departureTime);
        const arrMin = minutesFromTime(b.arrivalTime);
        if (depMin > arrMin) {
          const aPlace = places.find((p) => p.id === a.placeId);
          const bPlace = places.find((p) => p.id === b.placeId);
          warnings.push({
            id: id('overlap'),
            level: 'warning',
            dayId: day.id,
            message: `「${aPlace?.name ?? '?'}」の出発(${a.departureTime})が「${bPlace?.name ?? '?'}」の到着(${b.arrivalTime})より後になっています。`,
          });
        }
      }
    }

    // 5. Reservation vs place time conflict
    for (const res of dayReservations) {
      if (!res.startAt) continue;
      const resStart = new Date(res.startAt);
      if (Number.isNaN(resStart.getTime())) continue;
      const resStartMin = resStart.getHours() * 60 + resStart.getMinutes();
      const resEndMin = res.endAt
        ? (() => {
            const e = new Date(res.endAt);
            return Number.isNaN(e.getTime()) ? null : e.getHours() * 60 + e.getMinutes();
          })()
        : null;

      for (const entry of timeline) {
        if (!entry.arrivalTime || !entry.departureTime) continue;
        const pArrMin = minutesFromTime(entry.arrivalTime);
        const pDepMin = minutesFromTime(entry.departureTime);
        if (resEndMin != null && resStartMin < pDepMin && resEndMin > pArrMin) {
          const place = places.find((p) => p.id === entry.placeId);
          if (place && res.placeId !== place.id) {
            warnings.push({
              id: id('res-conflict'),
              level: 'warning',
              dayId: day.id,
              message: `予約「${res.title}」とスポット「${place.name}」の時間が重なっています。`,
            });
          }
        }
      }
    }

    // 6. No lodging reservation (last day excluded)
    const isLastDay = ctx.days.at(-1)?.id === day.id;
    if (!isLastDay) {
      const hasLodging = dayReservations.some((r) => r.kind === 'lodging');
      if (!hasLodging) {
        warnings.push({
          id: id('no-lodging'),
          level: 'info',
          dayId: day.id,
          message: '宿泊予約が登録されていません。',
        });
      }
    }

    // 7. Rainy day with outdoor places
    const weatherCode = ctx.weatherCodeByDate?.[day.date];
    if (weatherCode != null && RAINY_WMO_CODES.has(weatherCode)) {
      const outdoorPlaces = places.filter((p) => OUTDOOR_CATEGORIES.has(p.category));
      if (outdoorPlaces.length > 0) {
        warnings.push({
          id: id('rain-outdoor'),
          level: 'caution',
          dayId: day.id,
          message: `雨の予報があります。屋外スポットが${outdoorPlaces.length}件あります。`,
        });
      }
    }

    // 8. Outdoor places after sunset
    const sunset = ctx.sunsetByDate?.[day.date];
    if (sunset) {
      const sunsetMin = minutesFromTime(sunset);
      for (const entry of timeline) {
        if (!entry.arrivalTime) continue;
        const arrMin = minutesFromTime(entry.arrivalTime);
        if (arrMin > sunsetMin) {
          const place = places.find((p) => p.id === entry.placeId);
          if (place && OUTDOOR_CATEGORIES.has(place.category)) {
            warnings.push({
              id: id('after-sunset'),
              level: 'info',
              dayId: day.id,
              message: `「${place.name}」は日没(${sunset})後の到着予定です。`,
            });
          }
        }
      }
    }
  }

  // ─── Trip-wide warnings ──────────────────────────────────────────────────

  // 9. Candidate places left unscheduled
  if (ctx.candidatePlaces.length > 0) {
    warnings.push({
      id: id('unscheduled-candidates'),
      level: 'info',
      dayId: null,
      message: `候補スポットが${ctx.candidatePlaces.length}件まだ日程に割り当てられていません。`,
    });
  }

  // 10. Budget overrun
  if (ctx.totalSpentYen != null && ctx.trip.budgetYen != null) {
    if (ctx.totalSpentYen > ctx.trip.budgetYen) {
      const over = ctx.totalSpentYen - ctx.trip.budgetYen;
      warnings.push({
        id: id('over-budget'),
        level: 'warning',
        dayId: null,
        message: `予算を${over.toLocaleString('ja-JP')}円超過しています。`,
      });
    }
  }

  return warnings;
}
