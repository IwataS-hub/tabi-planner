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

export const dailyWeatherSchema = z.object({
  time: z.array(z.string()),
  weather_code: z.array(z.number()),
  temperature_2m_max: z.array(z.number()),
  temperature_2m_min: z.array(z.number()),
  apparent_temperature_max: z.array(z.number()),
  apparent_temperature_min: z.array(z.number()),
  precipitation_sum: z.array(z.number()),
  precipitation_probability_max: z.array(z.number()),
  wind_speed_10m_max: z.array(z.number()),
  uv_index_max: z.array(z.number()),
  sunrise: z.array(z.string()),
  sunset: z.array(z.string()),
});

export const hourlyWeatherSchema = z.object({
  time: z.array(z.string()),
  temperature_2m: z.array(z.number()),
  apparent_temperature: z.array(z.number()),
  precipitation_probability: z.array(z.number()),
  weather_code: z.array(z.number()),
  wind_speed_10m: z.array(z.number()),
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
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  apparentTempMaxC: number;
  apparentTempMinC: number;
  precipitationMm: number;
  precipProbabilityMax: number;
  windSpeedMaxKmh: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
}

export interface HourlyWeather {
  /** ISO 8601 e.g. "2025-07-01T09:00" */
  time: string;
  tempC: number;
  apparentTempC: number;
  precipProbability: number;
  weatherCode: number;
  windSpeedKmh: number;
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
      weatherCode: raw.weather_code[i] ?? 0,
      tempMaxC: raw.temperature_2m_max[i] ?? 0,
      tempMinC: raw.temperature_2m_min[i] ?? 0,
      apparentTempMaxC: raw.apparent_temperature_max[i] ?? 0,
      apparentTempMinC: raw.apparent_temperature_min[i] ?? 0,
      precipitationMm: raw.precipitation_sum[i] ?? 0,
      precipProbabilityMax: raw.precipitation_probability_max[i] ?? 0,
      windSpeedMaxKmh: raw.wind_speed_10m_max[i] ?? 0,
      uvIndexMax: raw.uv_index_max[i] ?? 0,
      sunrise: raw.sunrise[i] ?? '',
      sunset: raw.sunset[i] ?? '',
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
      tempC: raw.temperature_2m[i] ?? 0,
      apparentTempC: raw.apparent_temperature[i] ?? 0,
      precipProbability: raw.precipitation_probability[i] ?? 0,
      weatherCode: raw.weather_code[i] ?? 0,
      windSpeedKmh: raw.wind_speed_10m[i] ?? 0,
    });
  }
  return results;
}

/**
 * Derive weather advice for a day. Thresholds are chosen for Japanese travel
 * context.
 */
export function getWeatherAdvice(day: DayWeather): WeatherAdvice {
  return {
    umbrella: day.precipProbabilityMax >= 40 || day.precipitationMm > 1,
    heavyRain: day.precipProbabilityMax >= 70 || day.precipitationMm > 10,
    heat: day.apparentTempMaxC >= 35,
    cold: day.apparentTempMinC < 5,
    highUv: day.uvIndexMax >= 8,
    strongWind: day.windSpeedMaxKmh >= 50,
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
