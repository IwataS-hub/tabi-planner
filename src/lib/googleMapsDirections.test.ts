import { describe, expect, it } from 'vitest';
import { buildTransitDirectionsUrl } from './googleMapsDirections';

const FROM = { latitude: 34.9948, longitude: 135.785 };
const TO = { latitude: 34.9858, longitude: 135.7588 };

describe('buildTransitDirectionsUrl', () => {
  it('builds an official Maps URL with api=1 and travelmode=transit', () => {
    const url = buildTransitDirectionsUrl(FROM, TO);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe('https://www.google.com/maps/dir/');
    expect(parsed.searchParams.get('api')).toBe('1');
    expect(parsed.searchParams.get('travelmode')).toBe('transit');
  });

  it('uses the from/to coordinates as origin and destination', () => {
    const parsed = new URL(buildTransitDirectionsUrl(FROM, TO)!);
    expect(parsed.searchParams.get('origin')).toBe('34.9948,135.785');
    expect(parsed.searchParams.get('destination')).toBe('34.9858,135.7588');
  });

  it('never contains an API key or a Geoapify reference', () => {
    const url = buildTransitDirectionsUrl(FROM, TO)!;
    expect(url.toLowerCase()).not.toContain('apikey');
    expect(url.toLowerCase()).not.toContain('geoapify');
    expect(url.length).toBeLessThan(2048);
  });

  it('returns null for out-of-range or non-finite coordinates', () => {
    expect(buildTransitDirectionsUrl({ latitude: 999, longitude: 135 }, TO)).toBeNull();
    expect(buildTransitDirectionsUrl(FROM, { latitude: 35, longitude: 200 })).toBeNull();
    expect(buildTransitDirectionsUrl({ latitude: Number.NaN, longitude: 135 }, TO)).toBeNull();
    expect(
      buildTransitDirectionsUrl(FROM, { latitude: 35, longitude: Number.POSITIVE_INFINITY }),
    ).toBeNull();
  });
});
