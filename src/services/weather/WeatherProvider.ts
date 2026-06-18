import type { TripWeather } from '@/domain/weather';
import type { LatLng } from '@/domain/types';

export interface WeatherRequest {
  coordinate: LatLng;
  startDate: string;
  endDate: string;
  signal?: AbortSignal;
}

export interface WeatherProvider {
  fetchWeather(request: WeatherRequest): Promise<TripWeather>;
}
