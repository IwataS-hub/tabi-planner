import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Map as MapIcon, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import type { LatLng } from '@/domain/types';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useSaveStatus } from '@/hooks/useSaveStatus';
import { useTrip, useTripDays, useTripPlaces } from '@/hooks/useTripData';
import { placeRepository, type PlacePatch } from '@/repositories/placeRepository';
import { ItineraryHeader } from './ItineraryHeader';
import { DayTabs } from './DayTabs';
import { PlaceList } from './PlaceList';
import { MapPanel } from './MapPanel';

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
  };

  const placesForDay = useMemo(
    () => placeList.filter((place) => place.dayId === selectedDayId),
    [placeList, selectedDayId],
  );

  const placeCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const place of placeList) counts[place.dayId] = (counts[place.dayId] ?? 0) + 1;
    return counts;
  }, [placeList]);

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
    if (created) setSelectedPlaceId(created.id);
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

  const handleFocusOnMap = (id: string) => selectPlace(id);

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
    <PlaceList
      places={placesForDay}
      selectedPlaceId={selectedPlaceId}
      onSelect={togglePlace}
      onReorder={handleReorder}
      onSave={handleSave}
      onDuplicate={handleDuplicate}
      onDelete={handleDelete}
      onFocusOnMap={handleFocusOnMap}
    />
  );

  const mapColumn = (
    <MapPanel
      places={placesForDay}
      selectedPlaceId={selectedPlaceId}
      fitNonce={fitNonce}
      flyNonce={flyNonce}
      onSelectPlace={selectPlace}
      onMapClick={handleMapClick}
      onFitAll={() => setFitNonce((value) => value + 1)}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ItineraryHeader trip={trip.data} />

      <div className="border-border bg-paper shrink-0 border-b px-3 py-2 sm:px-4">
        <DayTabs
          days={dayList}
          selectedDayId={selectedDayId}
          placeCountByDay={placeCountByDay}
          onSelect={handleSelectDay}
        />
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
