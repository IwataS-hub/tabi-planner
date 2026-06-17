import type { Place } from './types';

/**
 * Aggregated totals for one day, derived entirely from saved Place data.
 * No totals are persisted — this is computed on demand and unit-tested
 * independently of the UI.
 */
export interface DaySummary {
  placeCount: number;
  totalStayMinutes: number;
  totalTravelMinutes: number;
  totalCost: number;
}

export function summarizeDay(places: Place[]): DaySummary {
  return places.reduce<DaySummary>(
    (acc, place) => ({
      placeCount: acc.placeCount + 1,
      totalStayMinutes: acc.totalStayMinutes + (place.stayMinutes ?? 0),
      totalTravelMinutes: acc.totalTravelMinutes + (place.travelMinutes ?? 0),
      totalCost: acc.totalCost + (place.estimatedCost ?? 0),
    }),
    { placeCount: 0, totalStayMinutes: 0, totalTravelMinutes: 0, totalCost: 0 },
  );
}
