import { z } from 'zod';

/** Open-Meteo WMO weather interpretation codes. */
export const WMO_DESCRIPTIONS: Record<number, string> = {
  0: '快晴',
  1: 'ほぼ快晴',
  2: '一部曇り',
  3: '曇り',
  45: '霧',
  48: '樹氷霧',
  51: '霧雨（弱）',
  53: '霧雨',
  55: '霧雨（強）',
  61: '雨（弱）',
  63: '雨',
  65: '雨（強）',
  71: '雪（弱）',
  73: '雪',
  75: '雪（強）',
  77: '霰',
  80: 'にわか雨（弱）',
  81: 'にわか雨',
  82: 'にわか雨（強）',
  85: '雪シャワー（弱）',
  86: '雪シャワー（強）',
  95: '雷雨',
  96: '雷雨（霰を伴う）',
  99: '雷雨（大粒の霰を伴う）',
};

export function wmoDescription(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? `天気コード ${code}`;
}

// ---------------------------------------------------------------------------
// Zod schemas for Open-Meteo API responses
// ---------------------------------------------------------------------------

// Numeric arrays allow null because some variables are unavailable for certain
// locations or models (e.g. uv_index_max over open ocean, precipitation_probability
// for certain grid points). The time array is always required and non-null.
const nullableNumberArray = z.array(z.number().nullable());
const nullableStringArray = z.array(z.string().nullable());

export const dailyWeatherSchema = z.object({
  time: z.array(z.string()),
  weather_code: nullableNumberArray,
  temperature_2m_max: nullableNumberArray,
  temperature_2m_min: nullableNumberArray,
  apparent_temperature_max: nullableNumberArray,
  apparent_temperature_min: nullableNumberArray,
  precipitation_sum: nullableNumberArray,
  precipitation_probability_max: nullableNumberArray,
  wind_speed_10m_max: nullableNumberArray,
  uv_index_max: nullableNumberArray,
  sunrise: nullableStringArray,
  sunset: nullableStringArray,
});

export const hourlyWeatherSchema = z.object({
  time: z.array(z.string()),
  temperature_2m: nullableNumberArray,
  apparent_temperature: nullableNumberArray,
  precipitation_probability: nullableNumberArray,
  weather_code: nullableNumberArray,
  wind_speed_10m: nullableNumberArray,
});

export const openMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  daily: dailyWeatherSchema,
  hourly: hourlyWeatherSchema,
});

export type OpenMeteoResponse = z.infer<typeof openMeteoResponseSchema>;

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface DayWeather {
  /** YYYY-MM-DD */
  date: string;
  weatherCode: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  apparentTempMaxC: number | null;
  apparentTempMinC: number | null;
  precipitationMm: number | null;
  precipProbabilityMax: number | null;
  windSpeedMaxKmh: number | null;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface HourlyWeather {
  /** ISO 8601 e.g. "2025-07-01T09:00" */
  time: string;
  tempC: number | null;
  apparentTempC: number | null;
  precipProbability: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
}

export interface TripWeather {
  fetchedAt: string;
  latitude: number;
  longitude: number;
  daily: DayWeather[];
  hourly: HourlyWeather[];
}

export interface WeatherAdvice {
  umbrella: boolean;
  heavyRain: boolean;
  heat: boolean;
  cold: boolean;
  highUv: boolean;
  strongWind: boolean;
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

export function parseDailyWeather(raw: z.infer<typeof dailyWeatherSchema>): DayWeather[] {
  const len = raw.time.length;
  const results: DayWeather[] = [];
  for (let i = 0; i < len; i += 1) {
    results.push({
      date: raw.time[i],
      weatherCode: raw.weather_code[i] ?? null,
      tempMaxC: raw.temperature_2m_max[i] ?? null,
      tempMinC: raw.temperature_2m_min[i] ?? null,
      apparentTempMaxC: raw.apparent_temperature_max[i] ?? null,
      apparentTempMinC: raw.apparent_temperature_min[i] ?? null,
      precipitationMm: raw.precipitation_sum[i] ?? null,
      precipProbabilityMax: raw.precipitation_probability_max[i] ?? null,
      windSpeedMaxKmh: raw.wind_speed_10m_max[i] ?? null,
      uvIndexMax: raw.uv_index_max[i] ?? null,
      sunrise: raw.sunrise[i] ?? null,
      sunset: raw.sunset[i] ?? null,
    });
  }
  return results;
}

export function parseHourlyWeather(raw: z.infer<typeof hourlyWeatherSchema>): HourlyWeather[] {
  const len = raw.time.length;
  const results: HourlyWeather[] = [];
  for (let i = 0; i < len; i += 1) {
    results.push({
      time: raw.time[i],
      tempC: raw.temperature_2m[i] ?? null,
      apparentTempC: raw.apparent_temperature[i] ?? null,
      precipProbability: raw.precipitation_probability[i] ?? null,
      weatherCode: raw.weather_code[i] ?? null,
      windSpeedKmh: raw.wind_speed_10m[i] ?? null,
    });
  }
  return results;
}

/**
 * Derive weather advice for a day. Thresholds are chosen for Japanese travel
 * context. Null values are treated conservatively (no warning when unknown,
 * except cold where we assume warm when unknown).
 */
export function getWeatherAdvice(day: DayWeather): WeatherAdvice {
  return {
    umbrella: (day.precipProbabilityMax ?? 0) >= 40 || (day.precipitationMm ?? 0) > 1,
    heavyRain: (day.precipProbabilityMax ?? 0) >= 70 || (day.precipitationMm ?? 0) > 10,
    heat: (day.apparentTempMaxC ?? 0) >= 35,
    cold: (day.apparentTempMinC ?? 100) < 5,
    highUv: (day.uvIndexMax ?? 0) >= 8,
    strongWind: (day.windSpeedMaxKmh ?? 0) >= 50,
  };
}

/**
 * Advice messages for the UI.
 */
export function adviceMessages(advice: WeatherAdvice): string[] {
  const messages: string[] = [];
  if (advice.heavyRain) messages.push('大雨の予報があります。外出には注意してください。');
  else if (advice.umbrella) messages.push('雨が降る可能性があります。傘を持参してください。');
  if (advice.heat) messages.push('猛暑日になる見込みです。熱中症対策をしてください。');
  if (advice.cold) messages.push('最低気温が低くなります。防寒対策をしてください。');
  if (advice.highUv) messages.push('紫外線が強い予報です。日焼け止めをご利用ください。');
  if (advice.strongWind) messages.push('強風の予報があります。お足元にご注意ください。');
  return messages;
}

/**
 * Weather-based checklist suggestions. Returns items only when the condition
 * warrants it; caller is responsible for deduplication.
 */
export interface WeatherSuggestion {
  title: string;
  category: string;
}

export function getWeatherSuggestions(advice: WeatherAdvice): WeatherSuggestion[] {
  const suggestions: WeatherSuggestion[] = [];
  if (advice.umbrella || advice.heavyRain) {
    suggestions.push({ title: '折りたたみ傘', category: '天気対策' });
  }
  if (advice.heavyRain) {
    suggestions.push({ title: 'レインコート', category: '天気対策' });
  }
  if (advice.heat) {
    suggestions.push({ title: '日焼け止め', category: '熱中症対策' });
    suggestions.push({ title: '冷却グッズ', category: '熱中症対策' });
  }
  if (advice.cold) {
    suggestions.push({ title: 'ダウンジャケット', category: '防寒グッズ' });
    suggestions.push({ title: '手袋', category: '防寒グッズ' });
  }
  if (advice.highUv) {
    suggestions.push({ title: 'サングラス', category: 'UV対策' });
    suggestions.push({ title: '帽子', category: 'UV対策' });
  }
  if (advice.strongWind) {
    suggestions.push({ title: '風を通さないアウター', category: '天気対策' });
  }
  return suggestions;
}

/**
 * Check if a YYYY-MM-DD date falls within the Open-Meteo forecast window.
 * Open-Meteo provides up to 16 days of forecast from today.
 */
export function isDateInForecastRange(date: string, today: string): boolean {
  if (date < today) return false;
  const todayMs = new Date(today).getTime();
  const dateMs = new Date(date).getTime();
  const daysDiff = Math.round((dateMs - todayMs) / 86_400_000);
  return daysDiff <= 15;
}
