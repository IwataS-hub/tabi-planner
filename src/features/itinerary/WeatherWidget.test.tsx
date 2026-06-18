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

  it('renders nothing when trip is out of forecast range', async () => {
    const days = [makeDay('d1', '2025-01-01')];
    const places = [makePlace('p1', 'd1')];
    const { container } = render(
      <WeatherWidget
        days={days}
        places={places}
        selectedDayId="d1"
        tripStartDate="2025-01-01"
        tripEndDate="2025-01-02"
      />,
    );
    // Should not render (out of range = render null)
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
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
});
