import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { SaveStatusProvider } from '@/hooks/useSaveStatus';
import { LoadingView } from '@/components/StateViews';
import { TripListPage } from '@/features/trips/TripListPage';

// Code-split the heavier routes (the itinerary route pulls in Leaflet and
// dnd-kit) so the trip list loads quickly.
const TripFormPage = lazy(() =>
  import('@/features/trips/TripFormPage').then((m) => ({ default: m.TripFormPage })),
);
const ItineraryPage = lazy(() =>
  import('@/features/itinerary/ItineraryPage').then((m) => ({ default: m.ItineraryPage })),
);
const MoneyPage = lazy(() =>
  import('@/features/money/MoneyPage').then((m) => ({ default: m.MoneyPage })),
);
const ChecklistsPage = lazy(() =>
  import('@/features/checklists/ChecklistsPage').then((m) => ({ default: m.ChecklistsPage })),
);
const NotFoundPage = lazy(() =>
  import('@/features/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

export function App() {
  return (
    <HashRouter>
      <SaveStatusProvider>
        <Suspense fallback={<LoadingView className="min-h-dvh" />}>
          <Routes>
            <Route path="/" element={<TripListPage />} />
            <Route path="/trips/new" element={<TripFormPage mode="create" />} />
            <Route path="/trips/:tripId/edit" element={<TripFormPage mode="edit" />} />
            <Route path="/trips/:tripId" element={<ItineraryPage />} />
            <Route path="/trips/:tripId/money" element={<MoneyPage />} />
            <Route path="/trips/:tripId/checklists" element={<ChecklistsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
        <Toaster richColors position="top-center" toastOptions={{ duration: 3500 }} />
      </SaveStatusProvider>
    </HashRouter>
  );
}
