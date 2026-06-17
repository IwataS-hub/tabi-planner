/**
 * UI-facing domain types. These are intentionally separate from the persistence
 * record types in `src/db/records.ts`; the repository layer maps between them.
 *
 * Conventions:
 * - Calendar dates are `YYYY-MM-DD` strings (local, no timezone).
 * - Timestamps are ISO 8601 strings.
 * - "Not set" optional values are represented as `null` (never `undefined`),
 *   so they round-trip cleanly through IndexedDB and Zod.
 */

import type { TravelEstimateSource, TravelMode } from './routing';

export const PLACE_CATEGORIES = [
  'sightseeing',
  'food',
  'cafe',
  'lodging',
  'shopping',
  'transport',
  'other',
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

/** Current schema version persisted on every Trip. Bump when records change. */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Maximum stored length of a place address. Generous enough for any Japanese
 * formatted address; API-sourced addresses are capped to this before saving.
 */
export const PLACE_ADDRESS_MAX_LENGTH = 200;

export interface Trip {
  id: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp */
  updatedAt: string;
  schemaVersion: number;
}

export interface TripDay {
  id: string;
  tripId: string;
  /** YYYY-MM-DD */
  date: string;
  /** Zero-based position of the day within the trip. */
  order: number;
}

export interface Place {
  id: string;
  tripId: string;
  dayId: string;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
  /** Optional formatted address (from search / reverse geocoding), or null. */
  address: string | null;
  /** "HH:mm" 24h, or null when not scheduled. */
  startTime: string | null;
  /** Dwell time in minutes, or null. */
  stayMinutes: number | null;
  /** Manually entered travel time to the next spot, in minutes, or null. */
  travelMinutes: number | null;
  memo: string;
  /** Related URL, or '' when none. */
  url: string;
  /** Estimated cost in JPY, or null. */
  estimatedCost: number | null;
  // --- Per-leg travel estimate to the NEXT spot (Phase 2.2) ----------------
  /** Travel mode of the current estimate, or null. */
  travelMode: TravelMode | null;
  /** Auto-estimated distance to the next spot in metres, or null. */
  travelDistanceMeters: number | null;
  /** Whether `travelMinutes` came from auto routing or manual entry, or null. */
  travelEstimateSource: TravelEstimateSource | null;
  /** The next Place id this estimate targets (segment identity), or null. */
  travelToPlaceId: string | null;
  /** Stable route key (coords + mode) the estimate was computed for, or null. */
  travelRouteKey: string | null;
  /** ISO timestamp the estimate was computed, or null. */
  travelCalculatedAt: string | null;
  /** Zero-based position within its day. */
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** A fully loaded trip with its days and the places grouped per day. */
export interface TripBundle {
  trip: Trip;
  days: TripDay[];
  placesByDay: Record<string, Place[]>;
}

/** Geographic coordinate used by the map integration. */
export interface LatLng {
  latitude: number;
  longitude: number;
}
