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
}

function MapClickHandler({ onMapClick }: { onMapClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onMapClick({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

/** Imperatively moves the map: fly to the selection, fit to all pins on request. */
function MapController({
  places,
  selectedPlaceId,
  fitNonce,
  flyNonce,
}: Pick<TripMapProps, 'places' | 'selectedPlaceId' | 'fitNonce' | 'flyNonce'>) {
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

  return null;
}

export function TripMap({
  places,
  selectedPlaceId,
  onSelectPlace,
  onMapClick,
  fitNonce,
  flyNonce,
}: TripMapProps) {
  const line = useMemo<[number, number][]>(
    () => places.map((place) => [place.latitude, place.longitude]),
    [places],
  );

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

      {line.length >= 2 ? (
        <Polyline positions={line} pathOptions={{ color: '#b94a32', weight: 3, opacity: 0.7 }} />
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
      <MapController
        places={places}
        selectedPlaceId={selectedPlaceId}
        fitNonce={fitNonce}
        flyNonce={flyNonce}
      />
    </MapContainer>
  );
}
