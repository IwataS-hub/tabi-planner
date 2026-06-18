import { openMeteoResponseSchema, parseDailyWeather, parseHourlyWeather } from '@/domain/weather';
import type { TripWeather } from '@/domain/weather';
import type { WeatherProvider, WeatherRequest } from './WeatherProvider';
import { WeatherError } from './weatherErrors';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 9000;

const DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'uv_index_max',
  'sunrise',
  'sunset',
].join(',');

const HOURLY_VARS = [
  'temperature_2m',
  'apparent_temperature',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
].join(',');

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly _fetch: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch) {
    this._fetch = fetchFn;
  }

  async fetchWeather(request: WeatherRequest): Promise<TripWeather> {
    const { coordinate, startDate, endDate, signal } = request;
    const params = new URLSearchParams({
      latitude: coordinate.latitude.toString(),
      longitude: coordinate.longitude.toString(),
      daily: DAILY_VARS,
      hourly: HOURLY_VARS,
      timezone: 'Asia/Tokyo',
      start_date: startDate,
      end_date: endDate,
    });
    const url = `${BASE_URL}?${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal
      : controller.signal;

    let response: Response;
    try {
      response = await this._fetch(url, { signal: combinedSignal });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof DOMException && err.name === 'AbortError') {
        const isTimeout =
          controller.signal.aborted && controller.signal.reason === 'timeout';
        throw new WeatherError(
          isTimeout ? 'timeout' : 'aborted',
          isTimeout ? '天気情報の取得がタイムアウトしました' : '天気情報の取得がキャンセルされました',
          err,
        );
      }
      throw new WeatherError('network', '天気情報の取得に失敗しました', err);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new WeatherError('server', `天気サーバーがエラーを返しました (${response.status})`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new WeatherError('invalid-response', '天気データの解析に失敗しました', err);
    }

    const parsed = openMeteoResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new WeatherError(
        'invalid-response',
        `天気データの形式が正しくありません: ${parsed.error.issues[0]?.message ?? '不明'}`,
      );
    }

    const data = parsed.data;
    return {
      fetchedAt: new Date().toISOString(),
      latitude: data.latitude,
      longitude: data.longitude,
      daily: parseDailyWeather(data.daily),
      hourly: parseHourlyWeather(data.hourly),
    };
  }
}
