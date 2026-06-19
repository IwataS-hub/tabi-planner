import { describe, expect, it } from 'vitest';
import {
  getWeatherAdvice,
  adviceMessages,
  getWeatherSuggestions,
  isDateInForecastRange,
  parseDailyWeather,
  parseHourlyWeather,
  wmoDescription,
  openMeteoResponseSchema,
  dailyWeatherSchema,
  hourlyWeatherSchema,
  type DayWeather,
} from './weather';

function makeDay(overrides: Partial<DayWeather> = {}): DayWeather {
  return {
    date: '2026-07-01',
    weatherCode: 0,
    tempMaxC: 28,
    tempMinC: 22,
    apparentTempMaxC: 30,
    apparentTempMinC: 24,
    precipitationMm: 0,
    precipProbabilityMax: 0,
    windSpeedMaxKmh: 20,
    uvIndexMax: 5,
    sunrise: '2026-07-01T04:45',
    sunset: '2026-07-01T19:00',
    ...overrides,
  };
}

describe('wmoDescription', () => {
  it('returns Japanese description for known codes', () => {
    expect(wmoDescription(0)).toBe('快晴');
    expect(wmoDescription(61)).toBe('雨（弱）');
    expect(wmoDescription(95)).toBe('雷雨');
  });

  it('returns fallback for unknown code', () => {
    expect(wmoDescription(999)).toBe('天気コード 999');
  });
});

describe('getWeatherAdvice', () => {
  it('all false for perfect weather', () => {
    const advice = getWeatherAdvice(makeDay());
    expect(advice.umbrella).toBe(false);
    expect(advice.heavyRain).toBe(false);
    expect(advice.heat).toBe(false);
    expect(advice.cold).toBe(false);
    expect(advice.highUv).toBe(false);
    expect(advice.strongWind).toBe(false);
  });

  it('umbrella when precipitation probability >= 40%', () => {
    expect(getWeatherAdvice(makeDay({ precipProbabilityMax: 40 })).umbrella).toBe(true);
    expect(getWeatherAdvice(makeDay({ precipProbabilityMax: 39 })).umbrella).toBe(false);
  });

  it('umbrella when precipitationMm > 1', () => {
    expect(getWeatherAdvice(makeDay({ precipitationMm: 1.1 })).umbrella).toBe(true);
    expect(getWeatherAdvice(makeDay({ precipitationMm: 1.0 })).umbrella).toBe(false);
  });

  it('heavyRain when precipitation probability >= 70%', () => {
    expect(getWeatherAdvice(makeDay({ precipProbabilityMax: 70 })).heavyRain).toBe(true);
    expect(getWeatherAdvice(makeDay({ precipProbabilityMax: 69 })).heavyRain).toBe(false);
  });

  it('heavyRain also sets umbrella', () => {
    const advice = getWeatherAdvice(makeDay({ precipProbabilityMax: 80 }));
    expect(advice.heavyRain).toBe(true);
    expect(advice.umbrella).toBe(true);
  });

  it('heat when apparentTempMaxC >= 35', () => {
    expect(getWeatherAdvice(makeDay({ apparentTempMaxC: 35 })).heat).toBe(true);
    expect(getWeatherAdvice(makeDay({ apparentTempMaxC: 34.9 })).heat).toBe(false);
  });

  it('cold when apparentTempMinC < 5', () => {
    expect(getWeatherAdvice(makeDay({ apparentTempMinC: 4.9 })).cold).toBe(true);
    expect(getWeatherAdvice(makeDay({ apparentTempMinC: 5 })).cold).toBe(false);
  });

  it('highUv when uvIndexMax >= 8', () => {
    expect(getWeatherAdvice(makeDay({ uvIndexMax: 8 })).highUv).toBe(true);
    expect(getWeatherAdvice(makeDay({ uvIndexMax: 7.9 })).highUv).toBe(false);
  });

  it('strongWind when windSpeedMaxKmh >= 50', () => {
    expect(getWeatherAdvice(makeDay({ windSpeedMaxKmh: 50 })).strongWind).toBe(true);
    expect(getWeatherAdvice(makeDay({ windSpeedMaxKmh: 49 })).strongWind).toBe(false);
  });
});

describe('adviceMessages', () => {
  it('returns no messages for ideal weather', () => {
    expect(adviceMessages(getWeatherAdvice(makeDay()))).toHaveLength(0);
  });

  it('returns umbrella message', () => {
    const msgs = adviceMessages(getWeatherAdvice(makeDay({ precipProbabilityMax: 50 })));
    expect(msgs.some((m) => m.includes('傘'))).toBe(true);
  });

  it('prioritises heavy rain over plain umbrella', () => {
    const msgs = adviceMessages(getWeatherAdvice(makeDay({ precipProbabilityMax: 80 })));
    expect(msgs.some((m) => m.includes('大雨'))).toBe(true);
    expect(msgs.some((m) => m.includes('傘') && !m.includes('大雨'))).toBe(false);
  });
});

describe('getWeatherSuggestions', () => {
  it('suggests umbrella for rain', () => {
    const advice = getWeatherAdvice(makeDay({ precipProbabilityMax: 50 }));
    const suggestions = getWeatherSuggestions(advice);
    expect(suggestions.some((s) => s.title.includes('傘'))).toBe(true);
  });

  it('suggests sunscreen and cooling for heat', () => {
    const advice = getWeatherAdvice(makeDay({ apparentTempMaxC: 38 }));
    const suggestions = getWeatherSuggestions(advice);
    expect(suggestions.some((s) => s.title.includes('日焼け止め'))).toBe(true);
  });

  it('returns no suggestions for perfect weather', () => {
    expect(getWeatherSuggestions(getWeatherAdvice(makeDay()))).toHaveLength(0);
  });
});

describe('isDateInForecastRange', () => {
  const today = '2026-07-01';

  it('includes today', () => {
    expect(isDateInForecastRange('2026-07-01', today)).toBe(true);
  });

  it('includes up to 15 days ahead', () => {
    expect(isDateInForecastRange('2026-07-16', today)).toBe(true);
  });

  it('excludes 16 days ahead', () => {
    expect(isDateInForecastRange('2026-07-17', today)).toBe(false);
  });

  it('excludes past dates', () => {
    expect(isDateInForecastRange('2026-06-30', today)).toBe(false);
  });
});

describe('parseDailyWeather', () => {
  const raw = {
    time: ['2026-07-01', '2026-07-02'],
    weather_code: [0, 61],
    temperature_2m_max: [28, 22],
    temperature_2m_min: [20, 18],
    apparent_temperature_max: [31, 23],
    apparent_temperature_min: [22, 19],
    precipitation_sum: [0, 5],
    precipitation_probability_max: [5, 65],
    wind_speed_10m_max: [15, 30],
    uv_index_max: [7, 3],
    sunrise: ['2026-07-01T04:45', '2026-07-02T04:46'],
    sunset: ['2026-07-01T19:10', '2026-07-02T19:09'],
  };

  it('converts all fields correctly', () => {
    const daily = parseDailyWeather(raw);
    expect(daily).toHaveLength(2);
    expect(daily[0].date).toBe('2026-07-01');
    expect(daily[0].weatherCode).toBe(0);
    expect(daily[1].weatherCode).toBe(61);
    expect(daily[1].precipProbabilityMax).toBe(65);
  });
});

describe('openMeteoResponseSchema', () => {
  it('rejects responses without required fields', () => {
    expect(openMeteoResponseSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a minimal valid response', () => {
    const valid = {
      latitude: 34.99,
      longitude: 135.78,
      timezone: 'Asia/Tokyo',
      daily: {
        time: [],
        weather_code: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        apparent_temperature_max: [],
        apparent_temperature_min: [],
        precipitation_sum: [],
        precipitation_probability_max: [],
        wind_speed_10m_max: [],
        uv_index_max: [],
        sunrise: [],
        sunset: [],
      },
      hourly: {
        time: [],
        temperature_2m: [],
        apparent_temperature: [],
        precipitation_probability: [],
        weather_code: [],
        wind_speed_10m: [],
      },
    };
    expect(openMeteoResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts null values in numeric arrays', () => {
    const withNulls = {
      latitude: 34.99,
      longitude: 135.78,
      timezone: 'Asia/Tokyo',
      daily: {
        time: ['2026-07-01'],
        weather_code: [0],
        temperature_2m_max: [28],
        temperature_2m_min: [20],
        apparent_temperature_max: [31],
        apparent_temperature_min: [22],
        precipitation_sum: [0],
        precipitation_probability_max: [null],
        wind_speed_10m_max: [15],
        uv_index_max: [null],
        sunrise: ['2026-07-01T04:45'],
        sunset: ['2026-07-01T19:10'],
      },
      hourly: {
        time: ['2026-07-01T00:00'],
        temperature_2m: [21],
        apparent_temperature: [20],
        precipitation_probability: [null],
        weather_code: [0],
        wind_speed_10m: [5],
      },
    };
    expect(openMeteoResponseSchema.safeParse(withNulls).success).toBe(true);
  });

  it('rejects responses where daily.time is absent', () => {
    const noTime = {
      latitude: 34.99,
      longitude: 135.78,
      timezone: 'Asia/Tokyo',
      daily: { weather_code: [] },
      hourly: { time: [] },
    };
    expect(openMeteoResponseSchema.safeParse(noTime).success).toBe(false);
  });
});

describe('dailyWeatherSchema – optional numeric arrays', () => {
  it('accepts daily with only time (fallback mode)', () => {
    expect(dailyWeatherSchema.safeParse({ time: ['2026-07-01'] }).success).toBe(true);
  });

  it('rejects daily without time', () => {
    expect(dailyWeatherSchema.safeParse({ weather_code: [0] }).success).toBe(false);
  });

  it('accepts empty time with no other fields', () => {
    expect(dailyWeatherSchema.safeParse({ time: [] }).success).toBe(true);
  });
});

describe('hourlyWeatherSchema – optional numeric arrays', () => {
  it('accepts hourly with only time (fallback mode)', () => {
    expect(hourlyWeatherSchema.safeParse({ time: ['2026-07-01T00:00'] }).success).toBe(true);
  });

  it('rejects hourly without time', () => {
    expect(hourlyWeatherSchema.safeParse({ temperature_2m: [20] }).success).toBe(false);
  });
});

describe('parseDailyWeather – optional/missing arrays', () => {
  it('returns null for all optional fields when they are absent', () => {
    const daily = parseDailyWeather({ time: ['2026-07-01', '2026-07-02'] });
    expect(daily).toHaveLength(2);
    expect(daily[0].weatherCode).toBeNull();
    expect(daily[0].tempMaxC).toBeNull();
    expect(daily[0].tempMinC).toBeNull();
    expect(daily[0].uvIndexMax).toBeNull();
    expect(daily[0].sunrise).toBeNull();
    expect(daily[0].sunset).toBeNull();
    expect(daily[1].precipProbabilityMax).toBeNull();
  });

  it('returns present fallback fields and null for absent fields', () => {
    const daily = parseDailyWeather({
      time: ['2026-07-01'],
      weather_code: [0],
      temperature_2m_max: [28],
      temperature_2m_min: [20],
      precipitation_sum: [0],
    });
    expect(daily[0].weatherCode).toBe(0);
    expect(daily[0].tempMaxC).toBe(28);
    expect(daily[0].tempMinC).toBe(20);
    expect(daily[0].precipitationMm).toBe(0);
    expect(daily[0].uvIndexMax).toBeNull();
    expect(daily[0].apparentTempMaxC).toBeNull();
    expect(daily[0].windSpeedMaxKmh).toBeNull();
    expect(daily[0].sunrise).toBeNull();
  });
});

describe('parseHourlyWeather – optional/missing arrays', () => {
  it('returns null for all optional fields when they are absent', () => {
    const hourly = parseHourlyWeather({ time: ['2026-07-01T00:00', '2026-07-01T01:00'] });
    expect(hourly).toHaveLength(2);
    expect(hourly[0].tempC).toBeNull();
    expect(hourly[0].apparentTempC).toBeNull();
    expect(hourly[0].precipProbability).toBeNull();
    expect(hourly[0].weatherCode).toBeNull();
    expect(hourly[0].windSpeedKmh).toBeNull();
  });

  it('returns present fallback fields and null for absent fields', () => {
    const hourly = parseHourlyWeather({
      time: ['2026-07-01T00:00'],
      temperature_2m: [21],
      precipitation_probability: [10],
    });
    expect(hourly[0].tempC).toBe(21);
    expect(hourly[0].precipProbability).toBe(10);
    expect(hourly[0].apparentTempC).toBeNull();
    expect(hourly[0].weatherCode).toBeNull();
    expect(hourly[0].windSpeedKmh).toBeNull();
  });
});

describe('parseDailyWeather with null values', () => {
  it('preserves null for uv_index_max and precipitation_probability_max', () => {
    const raw = {
      time: ['2026-07-01', '2026-07-02'],
      weather_code: [0, 61],
      temperature_2m_max: [28, 22],
      temperature_2m_min: [20, 18],
      apparent_temperature_max: [31, 23],
      apparent_temperature_min: [22, 19],
      precipitation_sum: [0, 5],
      precipitation_probability_max: [null, 65],
      wind_speed_10m_max: [15, 30],
      uv_index_max: [null, 3],
      sunrise: ['2026-07-01T04:45', '2026-07-02T04:46'],
      sunset: ['2026-07-01T19:10', '2026-07-02T19:09'],
    };
    const daily = parseDailyWeather(raw);
    expect(daily[0].uvIndexMax).toBeNull();
    expect(daily[0].precipProbabilityMax).toBeNull();
    expect(daily[1].uvIndexMax).toBe(3);
    expect(daily[1].precipProbabilityMax).toBe(65);
  });

  it('handles arrays shorter than time without throwing', () => {
    const raw = {
      time: ['2026-07-01', '2026-07-02'],
      weather_code: [0],
      temperature_2m_max: [28],
      temperature_2m_min: [20],
      apparent_temperature_max: [31],
      apparent_temperature_min: [22],
      precipitation_sum: [0],
      precipitation_probability_max: [],
      wind_speed_10m_max: [15],
      uv_index_max: [],
      sunrise: ['2026-07-01T04:45'],
      sunset: ['2026-07-01T19:10'],
    };
    const daily = parseDailyWeather(raw);
    expect(daily).toHaveLength(2);
    expect(daily[1].uvIndexMax).toBeNull();
    expect(daily[1].precipProbabilityMax).toBeNull();
  });
});
