import type { Place, Trip, TripDay } from '@/domain/types';
import type { PlaceRecord, TripDayRecord, TripRecord } from './records';

/**
 * Explicit mappers between persistence records and UI domain objects. Today the
 * shapes match field-for-field, but routing every read/write through these
 * functions keeps the boundary real: if the stored shape ever diverges from the
 * domain shape, only these mappers change and TypeScript flags any missed field.
 */

export function tripFromRecord(record: TripRecord): Trip {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    startDate: record.startDate,
    endDate: record.endDate,
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
    order: place.order,
    createdAt: place.createdAt,
    updatedAt: place.updatedAt,
  };
}
