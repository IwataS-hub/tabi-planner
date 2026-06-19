import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Map as MapIcon, ListChecks, BookmarkCheck, ChevronDown, ChevronUp } from 'lucide-react';
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
import { computeTimeline } from '@/domain/timeline';
import { computeWarnings } from '@/domain/itineraryWarnings';
import { generateIcs } from '@/domain/icsExport';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSaveStatus } from '@/hooks/useSaveStatus';
import {
  useTrip,
  useTripDays,
  useTripPlaces,
  useTripCandidates,
  useTripReservations,
} from '@/hooks/useTripData';
import {
  placeRepository,
  movePlaceToDay,
  movePlaceToCandidate,
  reverseGeocodePatch,
  type PlacePatch,
} from '@/repositories/placeRepository';
import { candidatePlaceRepository } from '@/repositories/candidatePlaceRepository';
import { reservationRepository } from '@/repositories/reservationRepository';
import { getGeocodingService } from '@/services/geocoding/geocodingService';
import { getRoutingService } from '@/services/routing/routingService';
import { downloadTextFile } from '@/lib/download';
import { ItineraryHeader } from './ItineraryHeader';
import { TripNav } from './TripNav';
import { DayTabs } from './DayTabs';
import { DaySummaryBar } from './DaySummaryBar';
import { PlaceList } from './PlaceList';
import { PlaceSearch } from './PlaceSearch';
import { MapPanel } from './MapPanel';
import { PrintItinerary } from './PrintItinerary';
import { WeatherWidget } from './WeatherWidget';
import { CandidateList } from './CandidateList';
import { ReservationsSection, type ReservationSaveInput } from './ReservationsSection';
import { WarningsCard } from './WarningsCard';

export function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { track } = useSaveStatus();

  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const places = useTripPlaces(tripId);
  const candidates = useTripCandidates(tripId);
  const reservations = useTripReservations(tripId);

  const [chosenDayId, setChosenDayId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [flyNonce, setFlyNonce] = useState(0);
  const [flyToCoord, setFlyToCoord] = useState<LatLng | null>(null);
  const [flyCoordNonce, setFlyCoordNonce] = useState(0);
  const [showCandidates, setShowCandidates] = useState(true);

  const geocodingService = useMemo(() => getGeocodingService(), []);
  const routingService = useMemo(() => getRoutingService(), []);

  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  const [routeGeometries, setRouteGeometries] = useState<Map<string, LatLng[]>>(() => new Map());
  const mapCenterRef = useRef<LatLng | null>(null);
  const getBias = useCallback<() => BiasCenter | null>(() => mapCenterRef.current, []);
  const handleCenterChange = useCallback((center: LatLng) => {
    mapCenterRef.current = center;
  }, []);

  const reverseControllers = useRef<Set<AbortController>>(new Set());
  useEffect(() => {
    const controllers = reverseControllers.current;
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, []);

  const dayList = useMemo(() => days.data ?? [], [days.data]);
  const placeList = useMemo(() => places.data ?? [], [places.data]);
  const candidateList = useMemo(() => candidates.data ?? [], [candidates.data]);
  const reservationList = useMemo(() => reservations.data ?? [], [reservations.data]);

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

  // Timeline computed from current day's places
  const timelineEntries = useMemo(() => {
    const entries = computeTimeline(placesForDay);
    return new Map(entries.map((e) => [e.placeId, e]));
  }, [placesForDay]);

  // Warnings computed for the entire trip
  const warnings = useMemo(() => {
    if (!trip.data) return [];
    const placesByDay: Record<string, Place[]> = {};
    const timelineByDay: Record<string, ReturnType<typeof computeTimeline>> = {};
    for (const day of dayList) {
      const dp = placeList.filter((p) => p.dayId === day.id);
      placesByDay[day.id] = dp;
      timelineByDay[day.id] = computeTimeline(dp);
    }
    return computeWarnings({
      trip: { budgetYen: trip.data.budgetYen },
      days: dayList,
      placesByDay,
      timelineByDay,
      reservations: reservationList,
      candidatePlaces: candidateList,
      totalSpentYen: null, // expense totals not loaded here
    });
  }, [trip.data, dayList, placeList, reservationList, candidateList]);

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
        if (!current) return;
        const patch = reverseGeocodePatch(current, result);
        if (patch) await placeRepository.update(placeId, patch);
      } catch {
        // best-effort
      } finally {
        reverseControllers.current.delete(controller);
      }
    },
    [geocodingService],
  );

  const handleMapClick = async (latlng: LatLng) => {
    if (!tripId || !selectedDayId) return;
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

  const handleSaveAsCandidate = async (place: GeoPlace) => {
    if (!tripId) return;
    await track(() =>
      candidatePlaceRepository.add({
        tripId,
        latitude: place.latitude,
        longitude: place.longitude,
        name: place.name,
        address: place.address,
      }),
    );
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

  const handleMoveToDay = (placeId: string, targetDayId: string) => {
    void track(() => movePlaceToDay(placeId, targetDayId));
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);
  };

  const handleMoveToCandidate = (placeId: string) => {
    void track(() => movePlaceToCandidate(placeId));
    if (selectedPlaceId === placeId) setSelectedPlaceId(null);
  };

  const handlePromoteCandidate = (candidateId: string, targetDayId: string) => {
    void track(() => candidatePlaceRepository.promoteToDay(candidateId, targetDayId));
  };

  const handleRemoveCandidate = (id: string) => {
    void track(() => candidatePlaceRepository.remove(id));
  };

  const handleReorderCandidates = (orderedIds: string[]) => {
    if (!tripId) return;
    void track(() => candidatePlaceRepository.reorder(tripId, orderedIds));
  };

  const handleAddReservation = (input: ReservationSaveInput) => {
    if (!tripId) return;
    void track(() =>
      reservationRepository.add({
        tripId,
        ...input,
      }),
    );
  };

  const handleEditReservation = (id: string, input: ReservationSaveInput) => {
    void track(() => reservationRepository.update(id, input));
  };

  const handleDeleteReservation = (id: string) => {
    void track(() => reservationRepository.remove(id));
  };

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

  const activeRouteGeometry = useMemo(() => {
    if (!selectedLegId) return null;
    const from = placesForDay.find((place) => place.id === selectedLegId);
    if (!from || !from.travelRouteKey) return null;
    return routeGeometries.get(from.travelRouteKey) ?? null;
  }, [selectedLegId, placesForDay, routeGeometries]);

  // Timeline for all days (used for print and ICS)
  const printTimeline = useMemo(() => {
    const result: Record<string, ReturnType<typeof computeTimeline>> = {};
    for (const day of dayList) {
      const dp = placeList.filter((p) => p.dayId === day.id);
      result[day.id] = computeTimeline(dp);
    }
    return result;
  }, [dayList, placeList]);

  const handleDownloadIcs = () => {
    if (!trip.data) return;
    const placesByDay: Record<string, Place[]> = {};
    const timelineByDay: Record<string, ReturnType<typeof computeTimeline>> = {};
    for (const day of dayList) {
      const dp = placeList.filter((p) => p.dayId === day.id);
      placesByDay[day.id] = dp;
      timelineByDay[day.id] = computeTimeline(dp);
    }
    const ics = generateIcs(trip.data, dayList, placesByDay, timelineByDay, reservationList);
    const title = trip.data.title.replace(/[<>:"/\\|?*]/g, '_').slice(0, 40);
    downloadTextFile(`tabiori_${title}.ics`, ics, 'text/calendar');
  };

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

  const warningsForDay = warnings.filter((w) => w.dayId === selectedDayId || w.dayId === null);

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
        onSaveAsCandidate={handleSaveAsCandidate}
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
        days={dayList}
        onMoveToDay={handleMoveToDay}
        onMoveToCandidate={handleMoveToCandidate}
        timelineEntries={timelineEntries}
      />
      {warningsForDay.length > 0 && (
        <WarningsCard warnings={warningsForDay} dayId={selectedDayId} title="この日の警告" />
      )}
      <ReservationsSection
        reservations={reservationList.filter((r) => r.dayId === selectedDayId || r.dayId === null)}
        days={dayList}
        onAdd={handleAddReservation}
        onEdit={handleEditReservation}
        onDelete={handleDeleteReservation}
      />
      {/* Candidate places box */}
      <section
        aria-labelledby="candidates-heading"
        className="bg-card rounded-xl border p-3 shadow-sm"
      >
        <button
          type="button"
          onClick={() => setShowCandidates((v) => !v)}
          className="flex w-full items-center justify-between"
          aria-expanded={showCandidates}
          aria-controls="candidates-body"
          id="candidates-heading"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <BookmarkCheck className="size-4" aria-hidden />
            候補スポット
            {candidateList.length > 0 && (
              <span className="bg-secondary text-ink-soft rounded px-1.5 py-0.5 text-[10px]">
                {candidateList.length}
              </span>
            )}
          </span>
          {showCandidates ? (
            <ChevronUp className="text-muted-foreground size-4" aria-hidden />
          ) : (
            <ChevronDown className="text-muted-foreground size-4" aria-hidden />
          )}
        </button>
        {showCandidates && (
          <div id="candidates-body" className="mt-2">
            <CandidateList
              candidates={candidateList}
              days={dayList}
              onPromote={handlePromoteCandidate}
              onRemove={handleRemoveCandidate}
              onReorder={handleReorderCandidates}
            />
          </div>
        )}
      </section>
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
        <ItineraryHeader trip={trip.data} onDownloadIcs={handleDownloadIcs} />
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
      <PrintItinerary
        trip={trip.data}
        days={dayList}
        places={placeList}
        candidatePlaces={candidateList}
        reservations={reservationList}
        timelineByDay={printTimeline}
      />
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
