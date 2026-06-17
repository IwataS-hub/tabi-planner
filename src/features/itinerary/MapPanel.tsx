import { Maximize2, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LatLng, Place } from '@/domain/types';
import { TripMap } from '@/features/map/TripMap';
import { MapLegend } from '@/features/map/MapLegend';

interface MapPanelProps {
  places: Place[];
  selectedPlaceId: string | null;
  fitNonce: number;
  flyNonce: number;
  flyToCoord?: LatLng | null;
  flyCoordNonce?: number;
  onSelectPlace: (id: string) => void;
  onMapClick: (latlng: LatLng) => void;
  onFitAll: () => void;
  onCenterChange?: (center: LatLng) => void;
  /** Real road/path shape of the selected leg (in-memory only), or null. */
  routeGeometry?: LatLng[] | null;
}

/** Map plus its toolbar (legend, fit-all). Controls sit above the map surface
 * so they never trigger the map's add-on-click handler. */
export function MapPanel({
  places,
  selectedPlaceId,
  fitNonce,
  flyNonce,
  flyToCoord,
  flyCoordNonce,
  onSelectPlace,
  onMapClick,
  onFitAll,
  onCenterChange,
  routeGeometry,
}: MapPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-border bg-card flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-ink-soft flex items-center gap-1.5 text-xs">
          <MousePointerClick className="text-ink-faint size-3.5" aria-hidden />
          地図をクリックしてスポットを追加
        </div>
        <Button variant="outline" size="sm" onClick={onFitAll} disabled={places.length === 0}>
          <Maximize2 aria-hidden />
          全体表示
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <TripMap
          places={places}
          selectedPlaceId={selectedPlaceId}
          onSelectPlace={onSelectPlace}
          onMapClick={onMapClick}
          fitNonce={fitNonce}
          flyNonce={flyNonce}
          flyToCoord={flyToCoord}
          flyCoordNonce={flyCoordNonce}
          onCenterChange={onCenterChange}
          routeGeometry={routeGeometry}
        />
      </div>

      <div className="border-border bg-card shrink-0 border-t px-3 py-2">
        <MapLegend />
      </div>
    </div>
  );
}
