import { getCategoryMeta } from '@/domain/categories';
import { formatDistanceMeters, TRAVEL_MODE_LABELS } from '@/domain/routing';
import { summarizeDay } from '@/domain/summary';
import type { Place, Trip, TripDay } from '@/domain/types';
import { dayCount, formatDuration, formatJaDate, formatJaDateRange, formatYen } from '@/lib/date';
import { APP } from '@/config/app';

/** Print-friendly "next leg" text: mode + time (+ distance for auto). */
function travelText(place: Place): string {
  if (place.travelMinutes == null) return '—';
  const isAuto = place.travelEstimateSource === 'auto';
  const prefix = isAuto && place.travelMode ? `${TRAVEL_MODE_LABELS[place.travelMode]} ` : '';
  const distance =
    isAuto && place.travelDistanceMeters != null
      ? `・${formatDistanceMeters(place.travelDistanceMeters)}`
      : '';
  return `${prefix}${formatDuration(place.travelMinutes)}${distance}`;
}

interface PrintItineraryProps {
  trip: Trip;
  days: TripDay[];
  places: Place[];
}

/**
 * Semantic, paper-friendly rendering of the whole trip, shown only when
 * printing (`hidden print:block`). It is driven by the same saved data as the
 * screen — no separate print store. Designed for A4 portrait and legible in
 * black & white (category is shown as text, not color alone).
 */
export function PrintItinerary({ trip, days, places }: PrintItineraryProps) {
  const placesByDay = new Map<string, Place[]>();
  for (const place of places) {
    const list = placesByDay.get(place.dayId) ?? [];
    list.push(place);
    placesByDay.set(place.dayId, list);
  }

  return (
    <div className="hidden text-black print:block">
      <header className="mb-5 border-b border-black pb-3">
        <p className="text-[10px] tracking-wide text-neutral-600">{APP.name} 旅のしおり</p>
        <h1 className="font-display text-2xl font-bold">{trip.title}</h1>
        {trip.description ? <p className="mt-1 text-sm">{trip.description}</p> : null}
        <p className="mt-1 text-sm text-neutral-700">
          {formatJaDateRange(trip.startDate, trip.endDate)}・全
          {dayCount(trip.startDate, trip.endDate)}日間
        </p>
      </header>

      {days.map((day, index) => {
        const dayPlaces = placesByDay.get(day.id) ?? [];
        const summary = summarizeDay(dayPlaces);
        return (
          <section key={day.id} className="mb-5 break-inside-avoid">
            <div className="flex items-baseline justify-between border-b border-neutral-400 pb-1">
              <h2 className="text-base font-bold">
                Day {index + 1}
                <span className="ml-2 text-sm font-normal text-neutral-700">
                  {formatJaDate(day.date)}
                </span>
              </h2>
              <p className="text-[11px] text-neutral-700">
                スポット{summary.placeCount}件・滞在{formatDuration(summary.totalStayMinutes)}・移動
                {formatDuration(summary.totalTravelMinutes)}・予算{formatYen(summary.totalCost)}
              </p>
            </div>

            {dayPlaces.length === 0 ? (
              <p className="py-2 text-sm text-neutral-500">予定はありません。</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {dayPlaces.map((place, placeIndex) => {
                  const meta = getCategoryMeta(place.category);
                  const isLast = placeIndex === dayPlaces.length - 1;
                  return (
                    <li
                      key={place.id}
                      className="break-inside-avoid border border-neutral-300 px-3 py-2"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold tabular-nums">{placeIndex + 1}.</span>
                        <span className="text-neutral-700 tabular-nums">
                          {place.startTime ?? '--:--'}
                        </span>
                        <span className="flex-1 font-semibold">{place.name}</span>
                        <span className="rounded border border-neutral-400 px-1.5 py-0.5 text-[10px]">
                          {meta.label}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-700">
                        滞在: {place.stayMinutes != null ? formatDuration(place.stayMinutes) : '—'}
                        {!isLast ? <> / 次への移動: {travelText(place)}</> : null} / 予算:{' '}
                        {place.estimatedCost != null ? formatYen(place.estimatedCost) : '—'}
                      </div>
                      {place.memo ? (
                        <p className="mt-1 text-[11px] whitespace-pre-wrap">メモ: {place.memo}</p>
                      ) : null}
                      {place.url ? (
                        <p className="mt-0.5 text-[11px] break-all text-neutral-700">{place.url}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
