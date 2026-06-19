import { describe, expect, it, vi } from 'vitest';
import { OpenMeteoWeatherProvider } from './OpenMeteoWeatherProvider';
import { WeatherError } from './weatherErrors';

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const coord = { latitude: 35.011, longitude: 135.768 };

function makeValidBody(
  dailyOverrides: Record<string, unknown> = {},
  hourlyOverrides: Record<string, unknown> = {},
) {
  return {
    latitude: 35.011,
    longitude: 135.768,
    timezone: 'Asia/Tokyo',
    daily: {
      time: [today, tomorrow],
      weather_code: [0, 61],
      temperature_2m_max: [28, 22],
      temperature_2m_min: [20, 18],
      apparent_temperature_max: [31, 23],
      apparent_temperature_min: [22, 19],
      precipitation_sum: [0, 5],
      precipitation_probability_max: [5, 65],
      wind_speed_10m_max: [15, 30],
      uv_index_max: [7, 3],
      sunrise: [`${today}T04:45`, `${tomorrow}T04:46`],
      sunset: [`${today}T19:10`, `${tomorrow}T19:09`],
      ...dailyOverrides,
    },
    hourly: {
      time: [`${today}T00:00`, `${today}T01:00`],
      temperature_2m: [21, 20],
      apparent_temperature: [20, 19],
      precipitation_probability: [10, 0],
      weather_code: [0, 0],
      wind_speed_10m: [5, 6],
      ...hourlyOverrides,
    },
  };
}

function mockOk(body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
}

describe('OpenMeteoWeatherProvider', () => {
  it('URL contains forecast_days=16 and no start_date/end_date', async () => {
    let capturedUrl = '';
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify(makeValidBody()), { status: 200 }));
    });
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    await provider.fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow });
    expect(capturedUrl).toContain('forecast_days=16');
    expect(capturedUrl).not.toContain('start_date');
    expect(capturedUrl).not.toContain('end_date');
  });

  it('parses null in uv_index_max as null in domain object', async () => {
    const provider = new OpenMeteoWeatherProvider(
      mockOk(makeValidBody({ uv_index_max: [null, null] })) as typeof fetch,
    );
    const result = await provider.fetchWeather({
      coordinate: coord,
      startDate: today,
      endDate: tomorrow,
    });
    expect(result.daily[0].uvIndexMax).toBeNull();
    expect(result.daily[1].uvIndexMax).toBeNull();
  });

  it('parses null in precipitation_probability_max as null', async () => {
    const provider = new OpenMeteoWeatherProvider(
      mockOk(makeValidBody({ precipitation_probability_max: [null, 30] })) as typeof fetch,
    );
    const result = await provider.fetchWeather({
      coordinate: coord,
      startDate: today,
      endDate: tomorrow,
    });
    expect(result.daily[0].precipProbabilityMax).toBeNull();
    expect(result.daily[1].precipProbabilityMax).toBe(30);
  });

  it('parses null in hourly precipitation_probability as null', async () => {
    const provider = new OpenMeteoWeatherProvider(
      mockOk(makeValidBody({}, { precipitation_probability: [null, 0] })) as typeof fetch,
    );
    const result = await provider.fetchWeather({
      coordinate: coord,
      startDate: today,
      endDate: tomorrow,
    });
    expect(result.hourly[0].precipProbability).toBeNull();
    expect(result.hourly[1].precipProbability).toBe(0);
  });

  it('handles hourly arrays shorter than daily arrays without throwing', async () => {
    const provider = new OpenMeteoWeatherProvider(
      mockOk(
        makeValidBody(
          {},
          {
            time: [`${today}T00:00`],
            temperature_2m: [21],
            apparent_temperature: [20],
            precipitation_probability: [10],
            weather_code: [0],
            wind_speed_10m: [5],
          },
        ),
      ) as typeof fetch,
    );
    const result = await provider.fetchWeather({
      coordinate: coord,
      startDate: today,
      endDate: tomorrow,
    });
    expect(result.hourly).toHaveLength(1);
  });

  it('throws WeatherError(server) with reason text from HTTP 400 body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: true, reason: 'Cannot initialize WeatherVariable' }), {
        status: 400,
      }),
    );
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    const err = await provider
      .fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherError);
    expect((err as WeatherError).kind).toBe('server');
    expect((err as WeatherError).message).toContain('Cannot initialize WeatherVariable');
  });

  it('throws WeatherError(server) with status code when body has no reason', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    const err = await provider
      .fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherError);
    expect((err as WeatherError).kind).toBe('server');
    expect((err as WeatherError).message).toContain('500');
  });

  it('throws WeatherError(network) when fetch rejects', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    const err = await provider
      .fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherError);
    expect((err as WeatherError).kind).toBe('network');
  });

  it('throws WeatherError(invalid-response) for non-JSON 200 body', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    const err = await provider
      .fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherError);
    expect((err as WeatherError).kind).toBe('invalid-response');
  });

  it('throws WeatherError(invalid-response) when time array is missing', async () => {
    const badBody = { latitude: 35, longitude: 135, timezone: 'Asia/Tokyo', daily: {}, hourly: {} };
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(badBody), { status: 200 }));
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    const err = await provider
      .fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeatherError);
    expect((err as WeatherError).kind).toBe('invalid-response');
  });

  it('does not expose coordinates or URLs in error messages', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const provider = new OpenMeteoWeatherProvider(mockFetch as typeof fetch);
    const err = await provider
      .fetchWeather({ coordinate: coord, startDate: today, endDate: tomorrow })
      .catch((e: unknown) => e);
    expect((err as WeatherError).message).not.toContain('35.011');
    expect((err as WeatherError).message).not.toContain('api.open-meteo.com');
  });
});
