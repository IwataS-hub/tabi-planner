import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Map as MapIcon, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import type { BiasCenter, GeoPlace } from '@/domain/geocoding';
import {
  routeKey,
  secondsToTravelMinutes,
  type RouteEstimate,
  type TravelMode,
} from '@/domain/routing';
import type { LatLng, Place, VisitStatus } from '@/domain/types';
import { summarizeDay } from '@/domain/summary';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSaveStatus } from '@/hooks/useSaveStatus';
import { useTrip, useTripDays, useTripPlaces } from '@/hooks/useTripData';
import {
  placeRepository,
  reverseGeocodePatch,
  type PlacePatch,
} from '@/repositories/placeRepository';
import { getGeocodingService } from '@/services/geocoding/geocodingService';
import { getRoutingService } from '@/services/routing/routingService';
import { ItineraryHeader } from './ItineraryHeader';
import { TripNav } from './TripNav';
import { DayTabs } from './DayTabs';
import { DaySummaryBar } from './DaySummaryBar';
import { PlaceList } from './PlaceList';
import { PlaceSearch } from './PlaceSearch';
import { MapPanel } from './MapPanel';
import { PrintItinerary } from './PrintItinerary';
import { WeatherWidget } from './WeatherWidget';

export function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { track } = useSaveStatus();

  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const places = useTripPlaces(tripId);

  const [chosenDayId, setChosenDayId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [flyNonce, setFlyNonce] = useState(0);
  const [flyToCoord, setFlyToCoord] = useState<LatLng | null>(null);
  const [flyCoordNonce, setFlyCoordNonce] = useState(0);

  // Resolved once; null when no API key is configured (search stays disabled,
  // manual map-click adds keep working).
  const geocodingService = useMemo(() => getGeocodingService(), []);
  const routingService = useMemo(() => getRoutingService(), []);

  // Currently highlighted leg (fromPlace id) and the in-session route shapes,
  // keyed by routeKey. Geometry is NEVER persisted: it lives only here and in
  // the routing cache, and is gone after a reload (saved time/distance remain).
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [routeGeometries, setRouteGeometries] = useState<Map<string, LatLng[]>>(() => new Map());
  // Current map center, kept in a ref so it can bias searches without causing
  // re-renders on every pan.
  const mapCenterRef = useRef<LatLng | null>(null);
  const getBias = useCallback<() => BiasCenter | null>(() => mapCenterRef.current, []);
  const handleCenterChange = useCallback((center: LatLng) => {
    mapCenterRef.current = center;
  }, []);

  // In-flight reverse-geocode requests, aborted if the page unmounts.
  const reverseControllers = useRef<Set<AbortController>>(new Set());
  useEffect(() => {
    const controllers = reverseControllers.current;
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, []);

  const dayList = days.data ?? [];
  const placeList = useMemo(() => places.data ?? [], [places.data]);

  // Derive the active day: the user's choice when still valid, else the first
  // day. This recovers automatically if the chosen day disappears (e.g. the
  // trip range was shortened) without needing a synchronising effect.
  const selectedDayId =
    chosenDayId && dayList.some((day) => day.id === chosenDayId)
      ? chosenDayId
      : (dayList[0]?.id ?? null);

  const handleSelectDay = (dayId: string) => {
    setChosenDayId(dayId);
    setSelectedPlaceId(null);
    setSelectedLegId(null);
  };

  const handleSelectLeg = useCallback((fromPlaceId: string) => {
    setSelectedLegId(fromPlaceId);
  }, []);

  const placesForDay = useMemo(
    () => placeList.filter((place) => place.dayId === selectedDayId),
    [placeList, selectedDayId],
  );

  // When a new calculation starts, drop any in-memory geometry for the leg's
  // current route key so the old shape is not shown during or after a failure.
  const handleLegCalculationStart = useCallback(
    (fromPlaceId: string) => {
      const from = placesForDay.find((p) => p.id === fromPlaceId);
      if (from?.travelRouteKey) {
        const key = from.travelRouteKey;
        setRouteGeometries((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [placesForDay],
  );

  // Switching a leg to public transit: clear any in-memory route shape for it
  // and persist the transit choice (a no-op when it would overwrite a saved
  // walk/drive/bicycle auto estimate, which is preserved).
  const handleTransitSelected = useCallback(
    (fromPlaceId: string) => {
      const from = placesForDay.find((p) => p.id === fromPlaceId);
      if (from?.travelRouteKey) {
        const key = from.travelRouteKey;
        setRouteGeometries((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
      setSelectedLegId((current) => (current === fromPlaceId ? null : current));
      void track(() => placeRepository.selectTransit(fromPlaceId));
    },
    [placesForDay, track],
  );

  const placeCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const place of placeList) counts[place.dayId] = (counts[place.dayId] ?? 0) + 1;
    return counts;
  }, [placeList]);

  const daySummary = useMemo(() => summarizeDay(placesForDay), [placesForDay]);

  // --- mutations (all routed through the save-status tracker) -------------
  const selectPlace = (id: string) => {
    setSelectedPlaceId(id);
    setFlyNonce((value) => value + 1);
  };

  const togglePlace = (id: string) => {
    if (selectedPlaceId === id) {
      setSelectedPlaceId(null);
    } else {
      selectPlace(id);
    }
  };

  /**
   * Best-effort reverse geocoding for a just-added place. Runs in the
   * background: the place already exists, so a failure (or a slow response)
   * never blocks or undoes the add. The current persisted place is re-read at
   * apply time so a late result can't overwrite a user edit or a deleted place.
   */
  const reverseGeocode = useCallback(
    async (placeId: string, coord: LatLng) => {
      if (!geocodingService) return;
      const controller = new AbortController();
      reverseControllers.current.add(controller);
      try {
        const result = await geocodingService.reverse({
          latitude: coord.latitude,
          longitude: coord.longitude,
          signal: controller.signal,
        });
        const current = await placeRepository.get(placeId);
        if (!current) return; // deleted meanwhile — never recreate
        const patch = reverseGeocodePatch(current, result);
        if (patch) await placeRepository.update(placeId, patch);
      } catch {
        // Reverse geocoding is best-effort; swallow so the main flow is unaffected.
      } finally {
        reverseControllers.current.delete(controller);
      }
    },
    [geocodingService],
  );

  const handleMapClick = async (latlng: LatLng) => {
    if (!tripId || !selectedDayId) return;
    // Add immediately (unchanged behaviour); enrich in the background.
    const created = await track(() =>
      placeRepository.add({
        tripId,
        dayId: selectedDayId,
        latitude: latlng.latitude,
        longitude: latlng.longitude,
      }),
    );
    if (created) {
      setSelectedPlaceId(created.id);
      void reverseGeocode(created.id, latlng);
    }
  };

  const handleSelectSearchResult = async (place: GeoPlace) => {
    if (!tripId || !selectedDayId) return;
    const created = await track(() =>
      placeRepository.add({
        tripId,
        dayId: selectedDayId,
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name,
        address: place.address,
      }),
    );
    if (created) {
      setSelectedPlaceId(created.id);
      setFlyToCoord({ latitude: place.latitude, longitude: place.longitude });
      setFlyCoordNonce((value) => value + 1);
    }
  };

  const handleSave = (id: string, patch: PlacePatch) => {
    void track(() => placeRepository.update(id, patch));
  };

  const handleDelete = (id: string) => {
    void track(() => placeRepository.remove(id));
    if (selectedPlaceId === id) setSelectedPlaceId(null);
  };

  const handleDuplicate = async (id: string) => {
    const copy = await track(() => placeRepository.duplicate(id));
    if (copy) setSelectedPlaceId(copy.id);
  };

  const handleReorder = (orderedIds: string[]) => {
    if (!selectedDayId) return;
    void track(() => placeRepository.reorderWithinDay(selectedDayId, orderedIds));
  };

  const handleVisitStatusChange = (id: string, status: VisitStatus) => {
    void track(() => placeRepository.update(id, { visitStatus: status }));
  };

  const handleFocusOnMap = (id: string) => selectPlace(id);

  /**
   * Persist a freshly computed leg estimate and remember its route shape for
   * the map (in memory only). The repository re-checks segment identity, so a
   * result that arrived after a reorder/delete is simply dropped.
   */
  const handleLegResult = useCallback(
    (fromPlace: Place, toPlace: Place, mode: TravelMode, estimate: RouteEstimate) => {
      const key = routeKey(
        { latitude: fromPlace.latitude, longitude: fromPlace.longitude },
        { latitude: toPlace.latitude, longitude: toPlace.longitude },
        mode,
      );
      setSelectedLegId(fromPlace.id);
      void track(async () => {
        const saved = await placeRepository.saveRouteEstimate({
          fromPlaceId: fromPlace.id,
          toPlaceId: toPlace.id,
          mode,
          minutes: secondsToTravelMinutes(estimate.timeSeconds),
          distanceMeters: Math.round(estimate.distanceMeters),
          expectedRouteKey: key,
          fromUpdatedAt: fromPlace.updatedAt,
          fromTravelMinutes: fromPlace.travelMinutes,
          fromTravelEstimateSource: fromPlace.travelEstimateSource,
          calculatedAt: new Date().toISOString(),
        });
        if (saved) {
          setRouteGeometries((prev) => new Map(prev).set(key, estimate.geometry));
        } else {
          setRouteGeometries((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
          setSelectedLegId((current) => (current === fromPlace.id ? null : current));
        }
        return saved;
      });
    },
    [track],
  );

  // The real-route shape for the selected leg, if it was computed this session.
  // After a reload there is no geometry (only saved time/distance), so the map
  // falls back to the straight itinerary line.
  const activeRouteGeometry = useMemo(() => {
    if (!selectedLegId) return null;
    const from = placesForDay.find((place) => place.id === selectedLegId);
    if (!from || !from.travelRouteKey) return null;
    return routeGeometries.get(from.travelRouteKey) ?? null;
  }, [selectedLegId, placesForDay, routeGeometries]);

  // --- loading / error / not found ---------------------------------------
  if (trip.status === 'loading' || days.status === 'loading') {
    return (
      <PageShell>
        <LoadingView label="旅程を読み込み中…" />
      </PageShell>
    );
  }
  if (trip.status === 'error') {
    return (
      <PageShell>
        <ErrorView title="旅程の読み込みに失敗しました" error={trip.error} />
      </PageShell>
    );
  }
  if (!trip.data) {
    return (
      <PageShell>
        <ErrorView
          title="旅行が見つかりません"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/">一覧へ戻る</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  const listColumn = (
    <div className="space-y-3">
      <WeatherWidget
        days={dayList}
        places={placeList}
        selectedDayId={selectedDayId}
        tripStartDate={trip.data.startDate}
        tripEndDate={trip.data.endDate}
      />
      <PlaceSearch
        service={geocodingService}
        getBias={getBias}
        canAdd={selectedDayId !== null}
        onSelectResult={handleSelectSearchResult}
      />
      <PlaceList
        places={placesForDay}
        selectedPlaceId={selectedPlaceId}
        onSelect={togglePlace}
        onReorder={handleReorder}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onFocusOnMap={handleFocusOnMap}
        routingService={routingService}
        selectedLegId={selectedLegId}
        onSelectLeg={handleSelectLeg}
        onLegResult={handleLegResult}
        onLegCalculationStart={handleLegCalculationStart}
        onTransitSelected={handleTransitSelected}
        onVisitStatusChange={handleVisitStatusChange}
      />
    </div>
  );

  const mapColumn = (
    <MapPanel
      places={placesForDay}
      selectedPlaceId={selectedPlaceId}
      fitNonce={fitNonce}
      flyNonce={flyNonce}
      flyToCoord={flyToCoord}
      flyCoordNonce={flyCoordNonce}
      onSelectPlace={selectPlace}
      onMapClick={handleMapClick}
      onFitAll={() => setFitNonce((value) => value + 1)}
      onCenterChange={handleCenterChange}
      routeGeometry={activeRouteGeometry}
    />
  );

  return (
    <>
      <div className="flex h-dvh flex-col overflow-hidden print:hidden">
        <ItineraryHeader trip={trip.data} />
        <TripNav tripId={trip.data.id} />

        <div className="border-border bg-paper shrink-0 space-y-2 border-b px-3 py-2 sm:px-4">
          <DayTabs
            days={dayList}
            selectedDayId={selectedDayId}
            placeCountByDay={placeCountByDay}
            onSelect={handleSelectDay}
          />
          <DaySummaryBar summary={daySummary} />
        </div>

        <div className="min-h-0 flex-1">
          {isDesktop ? (
            <div className="grid h-full grid-cols-[minmax(360px,440px)_1fr]">
              <div className="border-border bg-paper min-h-0 overflow-y-auto border-r p-3">
                {listColumn}
              </div>
              <div className="min-h-0">{mapColumn}</div>
            </div>
          ) : (
            <Tabs defaultValue="itinerary" className="flex h-full flex-col">
              <TabsList className="mx-3 mt-2 self-center">
                <TabsTrigger value="itinerary">
                  <ListChecks aria-hidden />
                  旅程
                </TabsTrigger>
                <TabsTrigger value="map">
                  <MapIcon aria-hidden />
                  地図
                </TabsTrigger>
              </TabsList>
              <TabsContent value="itinerary" className="min-h-0 flex-1 overflow-y-auto p-3">
                {listColumn}
              </TabsContent>
              <TabsContent value="map" className="min-h-0 flex-1 data-[state=inactive]:hidden">
                {mapColumn}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
      <PrintItinerary trip={trip.data} days={dayList} places={placeList} />
    </>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
    </div>
  );
}
