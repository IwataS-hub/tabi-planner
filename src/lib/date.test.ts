import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  dayCount,
  eachDateInRange,
  formatDuration,
  formatYen,
  isValidISODate,
  isValidTime,
} from './date';

describe('eachDateInRange', () => {
  it('lists every date inclusively', () => {
    expect(eachDateInRange('2026-07-01', '2026-07-03')).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
  });

  it('returns a single date for a day trip', () => {
    expect(eachDateInRange('2026-07-01', '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('crosses month boundaries correctly', () => {
    expect(eachDateInRange('2026-07-30', '2026-08-01')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
  });

  it('returns empty when the end precedes the start', () => {
    expect(eachDateInRange('2026-07-03', '2026-07-01')).toEqual([]);
  });
});

describe('dayCount', () => {
  it('counts inclusive days', () => {
    expect(dayCount('2026-07-01', '2026-07-03')).toBe(3);
    expect(dayCount('2026-07-01', '2026-07-01')).toBe(1);
  });
});

describe('isValidISODate', () => {
  it('accepts real dates', () => {
    expect(isValidISODate('2026-07-01')).toBe(true);
  });

  it('rejects malformed or impossible dates', () => {
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidISODate('2026/07/01')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });
});

describe('isValidTime', () => {
  it('accepts 24h times and rejects bad ones', () => {
    expect(isValidTime('09:30')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
    expect(isValidTime('9:30')).toBe(false);
  });
});

describe('formatDuration', () => {
  it('formats minutes into hours/minutes in Japanese', () => {
    expect(formatDuration(45)).toBe('45分');
    expect(formatDuration(90)).toBe('1時間30分');
    expect(formatDuration(120)).toBe('2時間');
  });
});

describe('formatYen', () => {
  it('formats amounts with thousands separators', () => {
    expect(formatYen(1500)).toContain('1,500');
  });
});

describe('addMinutesToTime', () => {
  it('adds minutes and wraps past midnight', () => {
    expect(addMinutesToTime('09:30', 90)).toBe('11:00');
    expect(addMinutesToTime('23:30', 60)).toBe('00:30');
    expect(addMinutesToTime('bad', 60)).toBeNull();
  });
});
