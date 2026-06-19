import { addMinutesToTime, isValidTime } from '@/lib/date';
import type { Place } from './types';

export interface TimelineEntry {
  placeId: string;
  /** "HH:mm" arrival estimate, or null when not computable. */
  arrivalTime: string | null;
  /** "HH:mm" departure estimate, or null when not computable. */
  departureTime: string | null;
  /** True when the time was inferred rather than explicitly set by the user. */
  isEstimated: boolean;
}

/**
 * Compute arrival and departure estimates for each place in a day.
 *
 * Rules:
 * - A place with `startTime` set is an anchor; its arrival = startTime.
 * - Departure = arrival + stayMinutes (if set).
 * - Next arrival = departure + travelMinutes (from this place to the next).
 * - When no anchor exists, the chain cannot be started and all times are null.
 * - If a later anchor conflicts with the forward projection, the later anchor
 *   wins and times before it are marked estimated=true.
 *
 * This is a pure function with no side-effects — the result is never persisted.
 */
export function computeTimeline(places: Place[]): TimelineEntry[] {
  if (places.length === 0) return [];

  const entries: TimelineEntry[] = places.map((p) => ({
    placeId: p.id,
    arrivalTime: null,
    departureTime: null,
    isEstimated: false,
  }));

  // First pass: forward propagation from each explicit startTime anchor.
  // We propagate forward until we hit the next anchor or run out of data.
  let i = 0;
  while (i < places.length) {
    const place = places[i];
    if (place.startTime && isValidTime(place.startTime)) {
      // This place is an anchor.
      entries[i].arrivalTime = place.startTime;
      entries[i].isEstimated = false;
      // Compute departure for this anchor.
      if (place.stayMinutes != null) {
        entries[i].departureTime = addMinutesToTime(place.startTime, place.stayMinutes);
      }
      // Propagate forward to the next anchor (or end).
      let departure = entries[i].departureTime;
      for (let j = i + 1; j < places.length; j++) {
        const prev = places[j - 1];
        const curr = places[j];
        // If the next place is also an anchor, stop forward propagation here.
        if (curr.startTime && isValidTime(curr.startTime)) break;
        if (departure == null || prev.travelMinutes == null) {
          // Can't propagate further without a departure time or travel minutes.
          break;
        }
        const arrival = addMinutesToTime(departure, prev.travelMinutes);
        if (!arrival) break;
        entries[j].arrivalTime = arrival;
        entries[j].isEstimated = true;
        if (curr.stayMinutes != null) {
          departure = addMinutesToTime(arrival, curr.stayMinutes);
          entries[j].departureTime = departure;
        } else {
          departure = null;
        }
      }
    }
    i++;
  }

  // Second pass: fill in any explicit anchor arrivals that the forward pass
  // didn't set (entries where isEstimated is still false but startTime exists).
  for (let k = 0; k < places.length; k++) {
    const place = places[k];
    if (place.startTime && isValidTime(place.startTime) && entries[k].arrivalTime == null) {
      entries[k].arrivalTime = place.startTime;
      entries[k].isEstimated = false;
      if (place.stayMinutes != null) {
        entries[k].departureTime = addMinutesToTime(place.startTime, place.stayMinutes);
      }
    }
  }

  return entries;
}
