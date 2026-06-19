import { describe, expect, it } from 'vitest';
import { generateIcs } from './icsExport';
import type { Place, Reservation, Trip, TripDay } from './types';
import type { TimelineEntry } from './timeline';

const TRIP: Trip = {
  id: 'trip1',
  title: '東北旅行',
  description: '',
  startDate: '2026-07-01',
  endDate: '2026-07-02',
  budgetYen: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 1,
};

const DAY: TripDay = { id: 'd1', tripId: 'trip1', date: '2026-07-01', order: 0 };

function makePlace(overrides: Partial<Place> & { id: string }): Place {
  return {
    tripId: 'trip1',
    dayId: 'd1',
    name: '松島',
    category: 'sightseeing',
    latitude: 38.3,
    longitude: 141.0,
    address: '宮城県松島町',
    startTime: '10:00',
    stayMinutes: 90,
    travelMinutes: null,
    memo: '',
    url: '',
    estimatedCost: null,
    visitStatus: 'planned',
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    travelToPlaceId: null,
    travelRouteKey: null,
    travelCalculatedAt: null,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('generateIcs', () => {
  it('generates valid VCALENDAR wrapper', () => {
    const ics = generateIcs(TRIP, [DAY], {}, {}, []);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
  });

  it('includes timezone VTIMEZONE block', () => {
    const ics = generateIcs(TRIP, [DAY], {}, {}, []);
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics).toContain('Asia/Tokyo');
  });

  it('creates VEVENT for place with startTime', () => {
    const place = makePlace({ id: 'p1', startTime: '10:00', stayMinutes: 90 });
    const ics = generateIcs(TRIP, [DAY], { d1: [place] }, {}, []);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:松島');
    expect(ics).toContain('place-p1@tabiori');
  });

  it('skips places with no time', () => {
    const place = makePlace({ id: 'p1', startTime: null });
    const ics = generateIcs(TRIP, [DAY], { d1: [place] }, {}, []);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('uses timeline estimate when no explicit startTime', () => {
    const place = makePlace({ id: 'p1', startTime: null });
    const entry: TimelineEntry = {
      placeId: 'p1',
      arrivalTime: '11:00',
      departureTime: '12:30',
      isEstimated: true,
    };
    const ics = generateIcs(TRIP, [DAY], { d1: [place] }, { d1: [entry] }, []);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:松島');
  });

  it('includes location in place events', () => {
    const place = makePlace({ id: 'p1', startTime: '10:00', address: '宮城県松島町' });
    const ics = generateIcs(TRIP, [DAY], { d1: [place] }, {}, []);
    expect(ics).toContain('LOCATION:宮城県松島町');
  });

  it('does NOT include confirmationCode', () => {
    const res: Reservation = {
      id: 'r1',
      tripId: 'trip1',
      dayId: 'd1',
      placeId: null,
      kind: 'lodging',
      title: 'ホテル松島',
      startAt: '2026-07-01T15:00:00.000Z',
      endAt: '2026-07-02T10:00:00.000Z',
      location: '松島',
      confirmationCode: 'ABC-123456',
      url: '',
      phone: '',
      memo: '',
      isPrivate: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const ics = generateIcs(TRIP, [DAY], {}, {}, [res]);
    expect(ics).toContain('SUMMARY:ホテル松島');
    expect(ics).not.toContain('ABC-123456');
    expect(ics).not.toContain('confirmationCode');
  });

  it('includes reservation with startAt', () => {
    const res: Reservation = {
      id: 'r1',
      tripId: 'trip1',
      dayId: 'd1',
      placeId: null,
      kind: 'transport',
      title: '東北新幹線',
      startAt: '2026-07-01T09:00:00.000Z',
      endAt: '2026-07-01T11:00:00.000Z',
      location: '東京駅',
      confirmationCode: '',
      url: '',
      phone: '',
      memo: '',
      isPrivate: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const ics = generateIcs(TRIP, [DAY], {}, {}, [res]);
    expect(ics).toContain('SUMMARY:東北新幹線');
    expect(ics).toContain('reservation-r1@tabiori');
  });

  it('skips reservation without startAt', () => {
    const res: Reservation = {
      id: 'r2',
      tripId: 'trip1',
      dayId: 'd1',
      placeId: null,
      kind: 'lodging',
      title: 'Hotel',
      startAt: null,
      endAt: null,
      location: '',
      confirmationCode: '',
      url: '',
      phone: '',
      memo: '',
      isPrivate: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const ics = generateIcs(TRIP, [DAY], {}, {}, [res]);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('uses 60min default when no endAt and no stayMinutes', () => {
    const place = makePlace({ id: 'p1', startTime: '10:00', stayMinutes: null });
    const ics = generateIcs(TRIP, [DAY], { d1: [place] }, {}, []);
    // 10:00 + 60min = 11:00 in JST
    expect(ics).toContain('DTSTART;TZID=Asia/Tokyo:20260701T100000');
    expect(ics).toContain('DTEND;TZID=Asia/Tokyo:20260701T110000');
  });
});
