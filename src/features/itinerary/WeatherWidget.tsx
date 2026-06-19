import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TripWeather, DayWeather, HourlyWeather, WeatherAdvice } from '@/domain/weather';
import { wmoDescription, getWeatherAdvice, adviceMessages } from '@/domain/weather';
import type { Place, TripDay } from '@/domain/types';
import { clearWeatherCache } from '@/services/weather/weatherCache';
import { fetchTripWeather, representativeCoordinate } from '@/services/weather/weatherService';
import { WeatherError } from '@/services/weather/weatherErrors';

interface WeatherWidgetProps {
  days: TripDay[];
  places: Place[];
  selectedDayId: string | null;
  tripStartDate: string;
  tripEndDate: string;
}

/** Todays date as YYYY-MM-DD (no timezone offset issues for JST). */
function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Find hourly entries nearest to HH:MM on the given day. */
function hourlyNearTime(
  hourly: HourlyWeather[],
  date: string,
  startTime: string,
): HourlyWeather | null {
  const [hh, mm] = startTime.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const targetMinutes = hh * 60 + mm;
  const dayEntries = hourly.filter((h) => h.time.startsWith(date));
  if (dayEntries.length === 0) return null;
  let best: HourlyWeather | null = null;
  let bestDiff = Infinity;
  for (const entry of dayEntries) {
    const timePart = entry.time.slice(11, 16); // "HH:MM"
    const [eh, em] = timePart.split(':').map(Number);
    const diff = Math.abs(eh * 60 + em - targetMinutes);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  return bestDiff <= 90 ? best : null; // within 90 minutes
}

function fmt(value: number | null, fn: (v: number) => number): string {
  return value !== null ? String(fn(value)) : '—';
}

function WeatherIcon({ code }: { code: number | null }) {
  if (code === null) return <span aria-hidden>—</span>;
  const desc = wmoDescription(code);
  const emoji =
    code === 0
      ? '☀️'
      : code <= 2
        ? '⛅'
        : code === 3
          ? '☁️'
          : code <= 48
            ? '🌫️'
            : code <= 67
              ? '🌧️'
              : code <= 77
                ? '🌨️'
                : code <= 82
                  ? '🌦️'
                  : code <= 86
                    ? '❄️'
                    : '⛈️';
  return (
    <span role="img" aria-label={desc} title={desc}>
      {emoji}
    </span>
  );
}

function DayWeatherCard({
  dayWeather,
  advice,
  placesWithTime,
  hourly,
}: {
  dayWeather: DayWeather;
  advice: WeatherAdvice;
  placesWithTime: Place[];
  hourly: HourlyWeather[];
}) {
  const messages = adviceMessages(advice);

  return (
    <div className="space-y-2">
      {/* Daily summary */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        <div className="flex items-center gap-1">
          <WeatherIcon code={dayWeather.weatherCode} />
          <span className="text-foreground font-medium">
            {dayWeather.weatherCode !== null ? wmoDescription(dayWeather.weatherCode) : '—'}
          </span>
        </div>
        <div className="text-ink-soft text-xs">
          🌡️ {fmt(dayWeather.tempMaxC, Math.round)}° / {fmt(dayWeather.tempMinC, Math.round)}°
          <span className="text-ink-faint">
            {' '}
            (体感 {fmt(dayWeather.apparentTempMaxC, Math.round)}° /{' '}
            {fmt(dayWeather.apparentTempMinC, Math.round)}°)
          </span>
        </div>
        <div className="text-ink-soft text-xs">
          ☔{' '}
          {dayWeather.precipProbabilityMax !== null ? `${dayWeather.precipProbabilityMax}%` : '—'} /{' '}
          {dayWeather.precipitationMm !== null ? `${dayWeather.precipitationMm.toFixed(1)}mm` : '—'}
        </div>
        <div className="text-ink-soft text-xs">
          💨 {fmt(dayWeather.windSpeedMaxKmh, Math.round)}km/h
        </div>
        <div className="text-ink-soft text-xs">
          ☀️ UV{dayWeather.uvIndexMax !== null ? dayWeather.uvIndexMax : '—'}
        </div>
        <div className="text-ink-soft text-xs">
          🌅 {dayWeather.sunrise ? dayWeather.sunrise.slice(11, 16) : '—'} / 🌇{' '}
          {dayWeather.sunset ? dayWeather.sunset.slice(11, 16) : '—'}
        </div>
      </div>

      {/* Advice messages */}
      {messages.length > 0 && (
        <ul className="space-y-0.5">
          {messages.map((msg, i) => (
            <li key={i} className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
              {msg}
            </li>
          ))}
        </ul>
      )}

      {/* Per-place hourly snippets */}
      {placesWithTime.length > 0 && (
        <div className="space-y-1">
          {placesWithTime.map((place) => {
            if (!place.startTime) return null;
            const hourlyEntry = hourlyNearTime(hourly, dayWeather.date, place.startTime);
            if (!hourlyEntry) return null;
            return (
              <div
                key={place.id}
                className="flex items-center gap-2 rounded-lg border border-dashed px-2 py-1 text-xs"
              >
                <span className="text-ink-soft max-w-[100px] truncate" title={place.name}>
                  {place.startTime} {place.name}
                </span>
                <WeatherIcon code={hourlyEntry.weatherCode} />
                <span className="text-ink-soft">{fmt(hourlyEntry.tempC, Math.round)}°</span>
                <span className="text-ink-soft">
                  ☔
                  {hourlyEntry.precipProbability !== null
                    ? `${hourlyEntry.precipProbability}%`
                    : '—'}
                </span>
                <span className="text-ink-soft">
                  💨{fmt(hourlyEntry.windSpeedKmh, Math.round)}km/h
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function weatherErrorMessage(err: unknown): string {
  if (err instanceof WeatherError) {
    switch (err.kind) {
      case 'network':
        return '天気APIに接続できませんでした。通信環境やブラウザ拡張を確認してください。';
      case 'timeout':
        return '天気APIへの接続がタイムアウトしました。時間をおいて再試行してください。';
      case 'server':
        return err.message;
      case 'invalid-response':
        return '天気データの一部を読み取れませんでした';
      default:
        return err.message;
    }
  }
  return err instanceof Error ? err.message : '天気情報の取得に失敗しました';
}

export function WeatherWidget({
  days,
  places,
  selectedDayId,
  tripStartDate,
  tripEndDate,
}: WeatherWidgetProps) {
  const [weather, setWeather] = useState<TripWeather | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error' | 'out-of-range'>(
    'idle',
  );
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const placesByDay = Object.fromEntries(
    days.map((d) => [d.id, places.filter((p) => p.dayId === d.id)]),
  );

  const coord = representativeCoordinate(days, placesByDay, selectedDayId ?? undefined);
  const hasCoord = coord != null && coord.latitude != null && coord.longitude != null;

  const load = useCallback(
    async (force = false) => {
      if (!hasCoord) return;
      const today = todayJst();
      if (force) clearWeatherCache();
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus('loading');
      setWeather(null);
      try {
        const result = await fetchTripWeather(
          coord!,
          tripStartDate,
          tripEndDate,
          today,
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        setWeather(result);
        setStatus('ok');
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if (err instanceof WeatherError && err.kind === 'out-of-range') {
          setStatus('out-of-range');
        } else if (err instanceof WeatherError && err.kind === 'aborted') {
          // Don't update UI for aborted fetches
        } else {
          setErrorMessage(weatherErrorMessage(err));
          setStatus('error');
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasCoord, tripStartDate, tripEndDate, coord?.latitude, coord?.longitude],
  );

  useEffect(() => {
    if (hasCoord) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    }
    return () => {
      abortRef.current?.abort();
    };
    // Re-fetch whenever the representative coordinate or date range changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoord, tripStartDate, tripEndDate, coord?.latitude, coord?.longitude]);

  if (!hasCoord) return null;

  if (status === 'out-of-range') {
    return (
      <div className="border-border rounded-xl border bg-sky-50/60 px-3 py-2.5 text-sm">
        <div className="text-ink-soft flex items-center gap-1.5 text-xs">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          予報範囲外です（旅行日程が現在から16日以内の場合のみ天気予報を表示します）
        </div>
      </div>
    );
  }

  const selectedDay = days.find((d) => d.id === selectedDayId);
  const dayWeather = weather?.daily.find((d) => d.date === selectedDay?.date) ?? null;
  const placesForDay = selectedDayId ? (placesByDay[selectedDayId] ?? []) : [];
  const placesWithTime = placesForDay.filter((p) => p.startTime != null);

  return (
    <div className="border-border rounded-xl border bg-sky-50/60 px-3 py-2.5 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-ink-soft text-[10px] font-medium tracking-wide uppercase">
          天気予報
          {weather && (
            <span className="ml-2 text-[10px] font-normal">
              取得:{' '}
              {new Date(weather.fetchedAt).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px]"
          aria-label="天気を更新"
          onClick={() => void load(true)}
          disabled={status === 'loading'}
        >
          <RefreshCw
            className={`size-3 ${status === 'loading' ? 'animate-spin' : ''}`}
            aria-hidden
          />
        </Button>
      </div>

      {status === 'loading' && !weather && (
        <p className="text-ink-soft text-xs">天気情報を取得中…</p>
      )}

      {status === 'error' && (
        <div className="text-destructive flex items-center gap-1.5 text-xs">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {errorMessage || '天気情報の取得に失敗しました'}
        </div>
      )}

      {status === 'ok' && !dayWeather && (
        <div className="text-ink-soft flex items-center gap-1.5 text-xs">
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
          この日の天気データがありません
        </div>
      )}

      {dayWeather && (
        <DayWeatherCard
          dayWeather={dayWeather}
          advice={getWeatherAdvice(dayWeather)}
          placesWithTime={placesWithTime}
          hourly={weather?.hourly ?? []}
        />
      )}
    </div>
  );
}
