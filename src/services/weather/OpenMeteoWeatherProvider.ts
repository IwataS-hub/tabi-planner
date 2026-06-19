import { openMeteoResponseSchema, parseDailyWeather, parseHourlyWeather } from '@/domain/weather';
import type { TripWeather } from '@/domain/weather';
import type { WeatherProvider, WeatherRequest } from './WeatherProvider';
import { WeatherError } from './weatherErrors';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 20000;

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

const FALLBACK_DAILY_VARS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
].join(',');

const FALLBACK_HOURLY_VARS = ['temperature_2m', 'precipitation_probability'].join(',');

export class OpenMeteoWeatherProvider implements WeatherProvider {
  private readonly _fetch: typeof fetch;

  constructor(fetchFn: typeof fetch = globalThis.fetch) {
    this._fetch = fetchFn;
  }

  async fetchWeather(request: WeatherRequest): Promise<TripWeather> {
    try {
      return await this._request(request, DAILY_VARS, HOURLY_VARS);
    } catch (primaryErr) {
      if (!(primaryErr instanceof WeatherError)) throw primaryErr;
      if (primaryErr.kind === 'aborted') throw primaryErr;

      if (import.meta.env.DEV) {
        console.warn(`[Weather] primary request failed: ${primaryErr.kind}`);
      }

      const isRetriable =
        primaryErr.kind === 'network' ||
        primaryErr.kind === 'timeout' ||
        primaryErr.kind === 'server' ||
        primaryErr.kind === 'invalid-response';

      if (!isRetriable || request.signal?.aborted) throw primaryErr;

      try {
        const result = await this._request(request, FALLBACK_DAILY_VARS, FALLBACK_HOURLY_VARS);
        if (import.meta.env.DEV) {
          console.warn('[Weather] fallback request succeeded');
        }
        return result;
      } catch (fallbackErr) {
        if (import.meta.env.DEV) {
          const kind = fallbackErr instanceof WeatherError ? fallbackErr.kind : 'unknown';
          console.warn(`[Weather] fallback request failed: ${kind}`);
        }
        throw primaryErr;
      }
    }
  }

  private async _request(
    request: WeatherRequest,
    dailyVars: string,
    hourlyVars: string,
  ): Promise<TripWeather> {
    const { coordinate, signal: outerSignal } = request;
    const params = new URLSearchParams({
      latitude: coordinate.latitude.toString(),
      longitude: coordinate.longitude.toString(),
      daily: dailyVars,
      hourly: hourlyVars,
      timezone: 'Asia/Tokyo',
      forecast_days: '16',
    });
    const url = `${BASE_URL}?${params.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
    const combinedSignal = outerSignal
      ? AbortSignal.any
        ? AbortSignal.any([outerSignal, controller.signal])
        : controller.signal
      : controller.signal;

    let response: Response;
    try {
      response = await this._fetch(url, { signal: combinedSignal });
    } catch (err) {
      throw this._classifyFetchError(err, controller, combinedSignal, outerSignal);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let reason = '';
      try {
        const errBody = (await response.json()) as { reason?: string };
        if (typeof errBody.reason === 'string') reason = errBody.reason;
      } catch {
        // ignore parse failure; use generic message
      }
      const detail = reason ? `: ${reason}` : ` (${response.status})`;
      throw new WeatherError('server', `天気APIがエラーを返しました${detail}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new WeatherError('invalid-response', '天気データの解析に失敗しました', err);
    }

    const parsed = openMeteoResponseSchema.safeParse(json);
    if (!parsed.success) {
      if (import.meta.env.DEV) {
        console.error('[Weather] schema parse failed:', parsed.error.issues[0]);
      }
      throw new WeatherError(
        'invalid-response',
        `天気データの一部を読み取れませんでした: ${parsed.error.issues[0]?.message ?? '不明'}`,
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

  private _classifyFetchError(
    err: unknown,
    controller: AbortController,
    combinedSignal: AbortSignal,
    outerSignal?: AbortSignal,
  ): WeatherError {
    const isTimeout =
      err === 'timeout' ||
      (err instanceof Error && err.name === 'TimeoutError') ||
      (controller.signal.aborted && controller.signal.reason === 'timeout') ||
      (combinedSignal.aborted && combinedSignal.reason === 'timeout');

    if (isTimeout) {
      return new WeatherError('timeout', '天気APIへの接続がタイムアウトしました');
    }

    const isAbort =
      (err instanceof Error && err.name === 'AbortError') || outerSignal?.aborted === true;

    if (isAbort) {
      return new WeatherError('aborted', '天気情報の取得がキャンセルされました');
    }

    return new WeatherError(
      'network',
      '天気APIに接続できませんでした',
      err instanceof Error ? err : undefined,
    );
  }
}
