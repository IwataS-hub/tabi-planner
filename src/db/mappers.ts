import type {
  CandidatePlace,
  ChecklistItem,
  Expense,
  ExpenseShare,
  Participant,
  Place,
  Reservation,
  Trip,
  TripDay,
} from '@/domain/types';
import type {
  CandidatePlaceRecord,
  ChecklistItemRecord,
  ExpenseRecord,
  ExpenseShareRecord,
  ParticipantRecord,
  PlaceRecord,
  ReservationRecord,
  TripDayRecord,
  TripRecord,
} from './records';

/**
 * Explicit mappers between persistence records and UI domain objects. If the
 * stored shape ever diverges from the domain shape, only these mappers change
 * and TypeScript flags any missed field.
 */

export function tripFromRecord(record: TripRecord): Trip {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    startDate: record.startDate,
    endDate: record.endDate,
    budgetYen: record.budgetYen ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    schemaVersion: record.schemaVersion,
  };
}

export function tripToRecord(trip: Trip): TripRecord {
  return {
    id: trip.id,
    title: trip.title,
    description: trip.description,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budgetYen: trip.budgetYen,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
    schemaVersion: trip.schemaVersion,
  };
}

export function dayFromRecord(record: TripDayRecord): TripDay {
  return {
    id: record.id,
    tripId: record.tripId,
    date: record.date,
    order: record.order,
  };
}

export function dayToRecord(day: TripDay): TripDayRecord {
  return {
    id: day.id,
    tripId: day.tripId,
    date: day.date,
    order: day.order,
  };
}

export function placeFromRecord(record: PlaceRecord): Place {
  return {
    id: record.id,
    tripId: record.tripId,
    dayId: record.dayId,
    name: record.name,
    category: record.category,
    latitude: record.latitude,
    longitude: record.longitude,
    address: record.address,
    startTime: record.startTime,
    stayMinutes: record.stayMinutes,
    travelMinutes: record.travelMinutes,
    memo: record.memo,
    url: record.url,
    estimatedCost: record.estimatedCost,
    // Null in legacy records → normalize to 'planned'
    visitStatus: record.visitStatus ?? 'planned',
    travelMode: record.travelMode,
    travelDistanceMeters: record.travelDistanceMeters,
    travelEstimateSource: record.travelEstimateSource,
    travelToPlaceId: record.travelToPlaceId,
    travelRouteKey: record.travelRouteKey,
    travelCalculatedAt: record.travelCalculatedAt,
    order: record.order,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function placeToRecord(place: Place): PlaceRecord {
  return {
    id: place.id,
    tripId: place.tripId,
    dayId: place.dayId,
    name: place.name,
    category: place.category,
    latitude: place.latitude,
    longitude: place.longitude,
    address: place.address,
    startTime: place.startTime,
    stayMinutes: place.stayMinutes,
    travelMinutes: place.travelMinutes,
    memo: place.memo,
    url: place.url,
    estimatedCost: place.estimatedCost,
    visitStatus: place.visitStatus,
    travelMode: place.travelMode,
    travelDistanceMeters: place.travelDistanceMeters,
    travelEstimateSource: place.travelEstimateSource,
    travelToPlaceId: place.travelToPlaceId,
    travelRouteKey: place.travelRouteKey,
    travelCalculatedAt: place.travelCalculatedAt,
    order: place.order,
    createdAt: place.createdAt,
    updatedAt: place.updatedAt,
  };
}

export function participantFromRecord(record: ParticipantRecord): Participant {
  return {
    id: record.id,
    tripId: record.tripId,
    name: record.name,
    order: record.order,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function participantToRecord(p: Participant): ParticipantRecord {
  return {
    id: p.id,
    tripId: p.tripId,
    name: p.name,
    order: p.order,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function expenseFromRecord(record: ExpenseRecord): Expense {
  return {
    id: record.id,
    tripId: record.tripId,
    dayId: record.dayId,
    placeId: record.placeId,
    title: record.title,
    amountYen: record.amountYen,
    category: record.category,
    payerId: record.payerId,
    occurredAt: record.occurredAt,
    memo: record.memo,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function expenseToRecord(e: Expense): ExpenseRecord {
  return {
    id: e.id,
    tripId: e.tripId,
    dayId: e.dayId,
    placeId: e.placeId,
    title: e.title,
    amountYen: e.amountYen,
    category: e.category,
    payerId: e.payerId,
    occurredAt: e.occurredAt,
    memo: e.memo,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function expenseShareFromRecord(record: ExpenseShareRecord): ExpenseShare {
  return {
    id: record.id,
    expenseId: record.expenseId,
    participantId: record.participantId,
    amountYen: record.amountYen,
  };
}

export function expenseShareToRecord(s: ExpenseShare): ExpenseShareRecord {
  return {
    id: s.id,
    expenseId: s.expenseId,
    participantId: s.participantId,
    amountYen: s.amountYen,
  };
}

export function checklistItemFromRecord(record: ChecklistItemRecord): ChecklistItem {
  return {
    id: record.id,
    tripId: record.tripId,
    kind: record.kind,
    title: record.title,
    completed: record.completed,
    assigneeId: record.assigneeId,
    dueAt: record.dueAt,
    category: record.category,
    order: record.order,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function checklistItemToRecord(item: ChecklistItem): ChecklistItemRecord {
  return {
    id: item.id,
    tripId: item.tripId,
    kind: item.kind,
    title: item.title,
    completed: item.completed,
    assigneeId: item.assigneeId,
    dueAt: item.dueAt,
    category: item.category,
    order: item.order,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function candidatePlaceFromRecord(record: CandidatePlaceRecord): CandidatePlace {
  return {
    id: record.id,
    tripId: record.tripId,
    name: record.name,
    category: record.category,
    latitude: record.latitude,
    longitude: record.longitude,
    address: record.address,
    startTime: record.startTime,
    stayMinutes: record.stayMinutes,
    memo: record.memo,
    url: record.url,
    estimatedCost: record.estimatedCost,
    visitStatus: record.visitStatus,
    order: record.order,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function candidatePlaceToRecord(c: CandidatePlace): CandidatePlaceRecord {
  return {
    id: c.id,
    tripId: c.tripId,
    name: c.name,
    category: c.category,
    latitude: c.latitude,
    longitude: c.longitude,
    address: c.address,
    startTime: c.startTime,
    stayMinutes: c.stayMinutes,
    memo: c.memo,
    url: c.url,
    estimatedCost: c.estimatedCost,
    visitStatus: c.visitStatus,
    order: c.order,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function reservationFromRecord(record: ReservationRecord): Reservation {
  return {
    id: record.id,
    tripId: record.tripId,
    dayId: record.dayId,
    placeId: record.placeId,
    kind: record.kind,
    title: record.title,
    startAt: record.startAt,
    endAt: record.endAt,
    location: record.location,
    confirmationCode: record.confirmationCode,
    url: record.url,
    phone: record.phone,
    memo: record.memo,
    isPrivate: record.isPrivate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function reservationToRecord(r: Reservation): ReservationRecord {
  return {
    id: r.id,
    tripId: r.tripId,
    dayId: r.dayId,
    placeId: r.placeId,
    kind: r.kind,
    title: r.title,
    startAt: r.startAt,
    endAt: r.endAt,
    location: r.location,
    confirmationCode: r.confirmationCode,
    url: r.url,
    phone: r.phone,
    memo: r.memo,
    isPrivate: r.isPrivate,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
