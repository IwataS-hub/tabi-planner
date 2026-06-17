import { describe, expect, it } from 'vitest';
import {
  formatDistanceMeters,
  geoapifyRoutingMode,
  routeKey,
  secondsToTravelMinutes,
} from './routing';

describe('secondsToTravelMinutes', () => {
  it('rounds up so a short leg is never 0', () => {
    expect(secondsToTravelMinutes(1)).toBe(1);
    expect(secondsToTravelMinutes(59)).toBe(1);
    expect(secondsToTravelMinutes(60)).toBe(1);
    expect(secondsToTravelMinutes(61)).toBe(2);
    expect(secondsToTravelMinutes(1080)).toBe(18);
  });

  it('never returns less than 1', () => {
    expect(secondsToTravelMinutes(0)).toBe(1);
  });
});

describe('formatDistanceMeters', () => {
  it('uses metres below 1km and km above', () => {
    expect(formatDistanceMeters(0)).toBe('0m');
    expect(formatDistanceMeters(950)).toBe('950m');
    expect(formatDistanceMeters(1000)).toBe('1.0km');
    expect(formatDistanceMeters(1300)).toBe('1.3km');
  });
});

describe('geoapifyRoutingMode', () => {
  it('maps every supported mode', () => {
    expect(geoapifyRoutingMode('walk')).toBe('walk');
    expect(geoapifyRoutingMode('drive')).toBe('drive');
    expect(geoapifyRoutingMode('bicycle')).toBe('bicycle');
    expect(geoapifyRoutingMode('transit')).toBe('transit');
  });
});

describe('routeKey', () => {
  const from = { latitude: 35.0, longitude: 135.0 };
  const to = { latitude: 35.1, longitude: 135.1 };

  it('is stable for the same coordinates and mode', () => {
    expect(routeKey(from, to, 'walk')).toBe(routeKey(from, to, 'walk'));
  });

  it('differs by mode and by direction', () => {
    expect(routeKey(from, to, 'walk')).not.toBe(routeKey(from, to, 'drive'));
    expect(routeKey(from, to, 'walk')).not.toBe(routeKey(to, from, 'walk'));
  });

  it('rounds coordinates so tiny differences share a key', () => {
    const near = { latitude: 35.000001, longitude: 135.000001 };
    expect(routeKey(from, to, 'walk')).toBe(routeKey(near, to, 'walk'));
  });
});
