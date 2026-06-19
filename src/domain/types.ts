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

export const VISIT_STATUSES = ['planned', 'visited', 'skipped'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'lodging',
  'sightseeing',
  'shopping',
  'activity',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CHECKLIST_KINDS = ['packing', 'todo'] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

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
  /** Optional overall budget in integer yen, or null. */
  budgetYen: number | null;
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
  /** Visit status, normalised from null (legacy) to 'planned'. */
  visitStatus: VisitStatus;
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

// ---------------------------------------------------------------------------
// Phase 2.3: Participants, Expenses, Checklists
// ---------------------------------------------------------------------------

export interface Participant {
  id: string;
  tripId: string;
  name: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  tripId: string;
  /** Optional day this expense belongs to, or null. */
  dayId: string | null;
  /** Optional place this expense is associated with, or null. */
  placeId: string | null;
  title: string;
  /** Integer yen amount. */
  amountYen: number;
  category: ExpenseCategory;
  /** Participant id of the person who paid. */
  payerId: string;
  /** YYYY-MM-DD when the expense occurred, or null. */
  occurredAt: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseShare {
  id: string;
  expenseId: string;
  participantId: string;
  /** Integer yen share amount. */
  amountYen: number;
}

export interface ChecklistItem {
  id: string;
  tripId: string;
  kind: ChecklistKind;
  title: string;
  completed: boolean;
  /** Participant id of the assignee, or null. */
  assigneeId: string | null;
  /** YYYY-MM-DD due date, or null. */
  dueAt: string | null;
  /** Free-form category label (e.g. "衣類", "書類"). */
  category: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}
