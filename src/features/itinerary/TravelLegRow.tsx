import { useState } from 'react';
import { AlertTriangle, Loader2, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_TRAVEL_MODE,
  formatDistanceMeters,
  isAutoEstimateStale,
  isReferenceMode,
  TRAVEL_MODE_LABELS,
  TRAVEL_MODE_OPTION_LABELS,
  TRAVEL_MODES,
  type RouteEstimate,
  type TravelMode,
} from '@/domain/routing';
import type { Place } from '@/domain/types';
import { formatDuration } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { RoutingProvider } from '@/services/routing/RoutingProvider';
import { routingMessage } from '@/services/routing/routingErrors';
import { useRouteLeg } from './useRouteLeg';

interface TravelLegRowProps {
  fromPlace: Place;
  toPlace: Place;
  service: RoutingProvider | null;
  selected: boolean;
  onSelect: () => void;
  onResult: (fromPlace: Place, toPlace: Place, mode: TravelMode, estimate: RouteEstimate) => void;
  /** Called just before a new route calculation starts (used to clear stale geometry). */
  onCalculationStart?: () => void;
}

function coordsOf(place: Place) {
  return { latitude: place.latitude, longitude: place.longitude };
}

/**
 * Compact connector between a spot and the next one in the same day. Lets the
 * user pick a travel mode and compute (or recompute) the road/path route via
 * Geoapify. The vertical left border conveys the itinerary's downward flow.
 */
export function TravelLegRow({
  fromPlace,
  toPlace,
  service,
  selected,
  onSelect,
  onResult,
  onCalculationStart,
}: TravelLegRowProps) {
  const { state, calculate } = useRouteLeg({
    service,
    onResult: (mode, estimate) => onResult(fromPlace, toPlace, mode, estimate),
  });
  const [mode, setMode] = useState<TravelMode>(fromPlace.travelMode ?? DEFAULT_TRAVEL_MODE);

  const stale = isAutoEstimateStale(fromPlace, toPlace);
  const minutes = fromPlace.travelMinutes;
  const isAuto = fromPlace.travelEstimateSource === 'auto';
  // For auto estimates, only show the saved result when the saved mode matches
  // the currently selected mode. A saved bicycle result must not appear as the
  // transit result when the user has switched the mode selector.
  const savedModeMatchesSelected = !isAuto || fromPlace.travelMode === mode;
  const showResult = minutes != null && !stale && savedModeMatchesSelected;
  const distance = fromPlace.travelDistanceMeters;
  const label = `${fromPlace.name} から ${toPlace.name} への移動`;

  const runCalculation = () => {
    onSelect();
    onCalculationStart?.();
    void calculate(coordsOf(fromPlace), coordsOf(toPlace), mode);
  };

  return (
    <li className="list-none">
      <div
        role="group"
        aria-label={label}
        className={cn(
          'ml-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 py-1.5 pl-3 text-xs',
          selected ? 'border-primary' : 'border-line-strong',
        )}
      >
        <Route className="text-ink-faint size-3.5 shrink-0" aria-hidden />

        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as TravelMode)}
          aria-label={`移動手段（${label}）`}
          className="border-input bg-card text-foreground focus-visible:ring-ring h-7 rounded-md border px-1.5 text-xs focus-visible:ring-2 focus-visible:outline-none"
        >
          {TRAVEL_MODES.map((value) => (
            <option key={value} value={value}>
              {TRAVEL_MODE_OPTION_LABELS[value]}
            </option>
          ))}
        </select>

        {service ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={runCalculation}
            disabled={state.status === 'loading'}
            aria-label={showResult ? `${label}を再計算` : `${label}のルートを計算`}
          >
            {state.status === 'loading' ? (
              <Loader2 className="size-3 animate-spin" aria-hidden />
            ) : null}
            {showResult ? '再計算' : 'ルートを計算'}
          </Button>
        ) : null}

        <span className="min-w-0">
          {state.status === 'loading' ? (
            <span role="status" className="text-ink-soft">
              計算中…
            </span>
          ) : showResult ? (
            <button
              type="button"
              onClick={onSelect}
              className="focus-visible:ring-ring rounded text-left focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`${label}を地図で表示`}
            >
              {isAuto && fromPlace.travelMode ? (
                <span className="text-foreground font-medium">
                  {TRAVEL_MODE_LABELS[fromPlace.travelMode]}{' '}
                </span>
              ) : null}
              <span className="text-ink-soft">
                {formatDuration(minutes)}
                {isAuto && distance != null ? `・${formatDistanceMeters(distance)}` : ''}
              </span>{' '}
              <span className="bg-secondary text-ink-soft rounded px-1 py-0.5 text-[10px]">
                {isAuto ? '自動' : '手入力'}
              </span>
              {isAuto && fromPlace.travelMode && isReferenceMode(fromPlace.travelMode) ? (
                <span className="text-ink-faint ml-1">（参考）</span>
              ) : null}
            </button>
          ) : minutes != null && stale ? (
            <span className="text-ink-soft flex items-center gap-1">
              <AlertTriangle className="text-accent-strong size-3 shrink-0" aria-hidden />
              区間が変わりました。再計算してください。
            </span>
          ) : (
            <span className="text-ink-faint">移動手段を選んで計算できます。</span>
          )}
        </span>

        {state.status === 'error' ? (
          <span role="alert" className="text-destructive flex basis-full items-center gap-1">
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
            {routingMessage(state.kind)}
          </span>
        ) : null}

        {!service ? (
          <span className="text-ink-faint basis-full">
            自動計算の設定がありません。移動時間はスポットの編集で手入力できます。
          </span>
        ) : null}
      </div>
    </li>
  );
}
