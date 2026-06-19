import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TripWeather } from '@/domain/weather';
import type { TripDay, Place } from '@/domain/types';
import { setWeatherProvider } from '@/services/weather/weatherService';
import { clearWeatherCache } from '@/services/weather/weatherCache';
import { WeatherWidget } from './WeatherWidget';

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function makeDay(id: string, date: string): TripDay {
  return { id, tripId: 't1', date, order: 0 };
}

function makePlace(id: string, dayId: string, lat = 35.0, lon = 135.0): Place {
  return {
    id,
    tripId: 't1',
    dayId,
    name: 'Test Place',
    category: 'sightseeing',
    address: null,
    latitude: lat,
    longitude: lon,
    stayMinutes: null,
    startTime: null,
    travelMinutes: null,
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    travelToPlaceId: null,
    travelRouteKey: null,
    travelCalculatedAt: null,
    estimatedCost: null,
    url: '',
    memo: '',
    order: 0,
    visitStatus: 'planned',
    createdAt: '',
    updatedAt: '',
  };
}

const stubDayWeather = {
  date: today,
  weatherCode: 0,
  tempMaxC: 25,
  tempMinC: 15,
  apparentTempMaxC: 27,
  apparentTempMinC: 13,
  precipitationMm: 0,
  precipProbabilityMax: 5,
  windSpeedMaxKmh: 10,
  uvIndexMax: 3,
  sunrise: `${today}T05:00`,
  sunset: `${today}T18:30`,
};

const stubWeather: TripWeather = {
  fetchedAt: new Date().toISOString(),
  latitude: 35.0,
  longitude: 135.0,
  daily: [stubDayWeather],
  hourly: [],
};

beforeEach(() => {
  clearWeatherCache();
  setWeatherProvider({ fetchWeather: vi.fn().mockResolvedValue(stubWeather) });
});

describe('WeatherWidget', () => {
  it('renders nothing when no places have coordinates', () => {
    const days = [makeDay('d1', today)];
    const { container } = render(
      <WeatherWidget
        days={days}
        places={[]}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows out-of-range message when trip is entirely outside the forecast window', async () => {
    const days = [makeDay('d1', '2025-01-01')];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate="2025-01-01"
        tripEndDate="2025-01-02"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/予報範囲外/)).toBeInTheDocument();
    });
  });

  it('displays daily weather on success', async () => {
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('天気予報')).toBeInTheDocument();
    });
    // Shows weather code description
    expect(screen.getByText(/晴れ|快晴/i)).toBeInTheDocument();
  });

  it('shows error message when provider throws', async () => {
    setWeatherProvider({
      fetchWeather: vi.fn().mockRejectedValue(new Error('ネットワークエラー')),
    });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/ネットワークエラー/)).toBeInTheDocument();
    });
  });

  it('manual refresh button re-fetches weather', async () => {
    const mockFetch = vi.fn().mockResolvedValue(stubWeather);
    setWeatherProvider({ fetchWeather: mockFetch });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(screen.getByText('天気予報')).toBeInTheDocument());
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '天気を更新' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it('uses selected day coordinate when selectedDayId is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue(stubWeather);
    setWeatherProvider({ fetchWeather: mockFetch });
    const days = [makeDay('d1', today), makeDay('d2', tomorrow)];
    const places = [makePlace('p1', 'd1', 35.0, 135.0), makePlace('p2', 'd2', 34.0, 136.0)];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d2"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const req = mockFetch.mock.calls[0][0];
    expect(req.coordinate.latitude).toBeCloseTo(34.0);
    expect(req.coordinate.longitude).toBeCloseTo(136.0);
  });

  it('clears stale weather and re-fetches when the representative coord changes', async () => {
    const day1Weather = { ...stubDayWeather, date: today };
    const day2Weather = { ...stubDayWeather, date: tomorrow };
    const weather1: typeof stubWeather = {
      ...stubWeather,
      latitude: 35.0,
      longitude: 135.0,
      daily: [day1Weather],
    };
    const weather2: typeof stubWeather = {
      ...stubWeather,
      latitude: 34.0,
      longitude: 136.0,
      daily: [day2Weather],
    };
    const mockFetch = vi.fn().mockResolvedValueOnce(weather1).mockResolvedValueOnce(weather2);
    setWeatherProvider({ fetchWeather: mockFetch });

    const days = [makeDay('d1', today), makeDay('d2', tomorrow)];
    const p1 = makePlace('p1', 'd1', 35.0, 135.0);
    const p2 = makePlace('p2', 'd2', 34.0, 136.0);

    const { rerender } = render(
      <WeatherWidget
        days={days}
        places={[p1, p2]}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // Switch to day 2 → coord changes → should re-fetch
    rerender(
      <WeatherWidget
        days={days}
        places={[p1, p2]}
        selectedDayId="d2"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const req2 = mockFetch.mock.calls[1][0];
    expect(req2.coordinate.latitude).toBeCloseTo(34.0);
  });

  it('shows hourly snippet for a place with startTime', async () => {
    const stubWithHourly: TripWeather = {
      ...stubWeather,
      hourly: [
        {
          time: `${today}T10:00`,
          tempC: 22,
          apparentTempC: 21,
          precipProbability: 0,
          weatherCode: 0,
          windSpeedKmh: 5,
        },
      ],
    };
    setWeatherProvider({ fetchWeather: vi.fn().mockResolvedValue(stubWithHourly) });

    const days = [makeDay('d1', today)];
    const places = [{ ...makePlace('p1', 'd1'), startTime: '10:00', name: '金閣寺' }];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/10:00/)).toBeInTheDocument();
      expect(screen.getByText(/金閣寺/)).toBeInTheDocument();
    });
  });

  it('renders card without crashing when uvIndexMax and precipProbabilityMax are null', async () => {
    const weatherWithNulls: TripWeather = {
      ...stubWeather,
      daily: [{ ...stubDayWeather, uvIndexMax: null, precipProbabilityMax: null }],
    };
    setWeatherProvider({ fetchWeather: vi.fn().mockResolvedValue(weatherWithNulls) });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(screen.getByText('天気予報')).toBeInTheDocument());
    // Card must still be visible and must not render "null" literals
    expect(screen.queryByText(/UVnull/)).not.toBeInTheDocument();
    expect(screen.queryByText(/null%/)).not.toBeInTheDocument();
  });

  it('shows — placeholder for null windSpeedMaxKmh', async () => {
    const weatherWithNullWind: TripWeather = {
      ...stubWeather,
      daily: [{ ...stubDayWeather, windSpeedMaxKmh: null }],
    };
    setWeatherProvider({ fetchWeather: vi.fn().mockResolvedValue(weatherWithNullWind) });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(screen.getByText('天気予報')).toBeInTheDocument());
    expect(screen.queryByText(/nullkm\/h/)).not.toBeInTheDocument();
  });

  it('shows network error message when provider throws WeatherError(network)', async () => {
    const { WeatherError: WErr } = await import('@/services/weather/weatherErrors');
    setWeatherProvider({
      fetchWeather: vi.fn().mockRejectedValue(new WErr('network', '天気APIに接続できませんでした')),
    });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/天気APIに接続できませんでした/)).toBeInTheDocument();
    });
  });

  it('shows network error with connectivity guidance text', async () => {
    const { WeatherError: WErr } = await import('@/services/weather/weatherErrors');
    setWeatherProvider({
      fetchWeather: vi.fn().mockRejectedValue(new WErr('network', '天気APIに接続できませんでした')),
    });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/通信環境やブラウザ拡張を確認してください/)).toBeInTheDocument();
    });
  });

  it('shows timeout error with retry guidance text', async () => {
    const { WeatherError: WErr } = await import('@/services/weather/weatherErrors');
    setWeatherProvider({
      fetchWeather: vi
        .fn()
        .mockRejectedValue(new WErr('timeout', '天気APIへの接続がタイムアウトしました')),
    });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/時間をおいて再試行してください/)).toBeInTheDocument();
    });
  });

  it('does not show error message when provider throws WeatherError(aborted)', async () => {
    const { WeatherError: WErr } = await import('@/services/weather/weatherErrors');
    const mockFetch = vi
      .fn()
      .mockRejectedValue(new WErr('aborted', '天気情報の取得がキャンセルされました'));
    setWeatherProvider({ fetchWeather: mockFetch });
    const days = [makeDay('d1', today)];
    const places = [makePlace('p1', 'd1')];
    render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate={today}
        tripEndDate={tomorrow}
      />,
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText(/キャンセル/)).not.toBeInTheDocument();
    expect(screen.queryByText(/失敗しました/)).not.toBeInTheDocument();
  });
});
