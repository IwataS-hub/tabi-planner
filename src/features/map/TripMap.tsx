import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLng, Place } from '@/domain/types';
import { createPlaceIcon } from './markerIcons';

const JAPAN_CENTER: [number, number] = [36.5, 138.0];
const JAPAN_ZOOM = 5;

interface TripMapProps {
  places: Place[];
  selectedPlaceId: string | null;
  onSelectPlace: (id: string) => void;
  onMapClick: (latlng: LatLng) => void;
  /** Increment to request a "fit all pins" of the current day. */
  fitNonce: number;
  /** Increment to pan/zoom to the currently selected place. */
  flyNonce: number;
  /** A coordinate to fly to (e.g. a freshly added search result). */
  flyToCoord?: LatLng | null;
  /** Increment to (re)trigger flying to {@link flyToCoord}. */
  flyCoordNonce?: number;
  /** Reports the current map center (used as a search bias). */
  onCenterChange?: (center: LatLng) => void;
  /** Real road/path shape of the selected leg to highlight, or null. */
  routeGeometry?: LatLng[] | null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onMapClick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

/** Reports the map center on load and after each move, for search biasing. */
function MapCenterReporter({ onCenterChange }: { onCenterChange: (center: LatLng) => void }) {
  const map = useMapEvents({
    moveend() {
      const center = map.getCenter();
      onCenterChange({ latitude: center.lat, longitude: center.lng });
    },
  });
  useEffect(() => {
    const center = map.getCenter();
    onCenterChange({ latitude: center.lat, longitude: center.lng });
    // Report once on mount; subsequent updates come from `moveend`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Imperatively moves the map: fly to the selection, fit to all pins on request. */
function MapController({
  places,
  selectedPlaceId,
  fitNonce,
  flyNonce,
  flyToCoord,
  flyCoordNonce,
}: Pick<
  TripMapProps,
  'places' | 'selectedPlaceId' | 'fitNonce' | 'flyNonce' | 'flyToCoord' | 'flyCoordNonce'
>) {
  const map = useMap();

  // Keep Leaflet's internal size in sync when the container resizes
  // (window resize, desktop/mobile layout changes, tab switches).
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);

  // Pan to the selected place when the page requests it.
  useEffect(() => {
    if (flyNonce === 0 || !selectedPlaceId) return;
    const place = places.find((item) => item.id === selectedPlaceId);
    if (!place) return;
    map.flyTo([place.latitude, place.longitude], Math.max(map.getZoom(), 14), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyNonce]);

  // Fit all of the current day's pins when the "全体表示" button is pressed.
  useEffect(() => {
    if (fitNonce === 0 || places.length === 0) return;
    const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]));
    map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // Fly to an explicit coordinate (a just-added search result, which may not be
  // in `places` yet on this tick — so we cannot rely on the by-id fly above).
  useEffect(() => {
    if (!flyCoordNonce || !flyToCoord) return;
    map.flyTo([flyToCoord.latitude, flyToCoord.longitude], Math.max(map.getZoom(), 14), {
      duration: 0.6,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyCoordNonce]);

  return null;
}

export function TripMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  onMapClick,
  fitNonce,
  flyNonce,
  flyToCoord,
  flyCoordNonce,
  onCenterChange,
  routeGeometry,
}: TripMapProps) {
  const line = useMemo<[number, number][]>(
    () => places.map((place) => [place.latitude, place.longitude]),
    [places],
  );
  const highlight = useMemo<[number, number][]>(
    () => (routeGeometry ?? []).map((point) => [point.latitude, point.longitude]),
    [routeGeometry],
  );
  const hasHighlight = highlight.length >= 2;

  return (
    <MapContainer
      center={JAPAN_CENTER}
      zoom={JAPAN_ZOOM}
      scrollWheelZoom
      className="size-full"
      // GSI tiles require attribution; keep the default control visible.
      attributionControl
    >
      <TileLayer
        url="https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"
        attribution='地図出典: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院（地理院タイル）</a>'
        maxZoom={18}
        maxNativeZoom={18}
      />

      {/* Itinerary order as a simple straight line. Dimmed (and dashed) while a
          real route is highlighted so the two never read as one shape. */}
      {line.length >= 2 ? (
        <Polyline
          positions={line}
          pathOptions={{
            color: '#b94a32',
            weight: 3,
            opacity: hasHighlight ? 0.3 : 0.7,
            dashArray: hasHighlight ? '4 6' : undefined,
          }}
        />
      ) : null}

      {/* Selected leg's real road/path route: distinct colour, thicker, solid. */}
      {hasHighlight ? (
        <Polyline
          positions={highlight}
          pathOptions={{ color: '#2f6f8f', weight: 6, opacity: 0.95 }}
        />
      ) : null}

      {places.map((place, index) => (
        <Marker
          key={place.id}
          position={[place.latitude, place.longitude]}
          icon={createPlaceIcon({
            category: place.category,
            order: index + 1,
            selected: place.id === selectedPlaceId,
          })}
          // Selected marker renders above the rest.
          zIndexOffset={place.id === selectedPlaceId ? 1000 : 0}
          eventHandlers={{ click: () => onSelectPlace(place.id) }}
          keyboard={false}
        />
      ))}

      <MapClickHandler onMapClick={onMapClick} />
      {onCenterChange ? <MapCenterReporter onCenterChange={onCenterChange} /> : null}
      <MapController
        places={places}
        selectedPlaceId={selectedPlaceId}
        fitNonce={fitNonce}
        flyNonce={flyNonce}
        flyToCoord={flyToCoord}
        flyCoordNonce={flyCoordNonce}
      />
    </MapContainer>
  );
}
