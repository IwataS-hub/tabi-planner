import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db/database';
import { SaveStatusProvider } from '@/hooks/useSaveStatus';
import { TripFormPage } from './TripFormPage';

function renderCreate() {
  return render(
    <SaveStatusProvider>
      <MemoryRouter initialEntries={['/trips/new']}>
        <Routes>
          <Route path="/trips/new" element={<TripFormPage mode="create" />} />
          <Route path="/trips/:tripId" element={<div>旅程画面</div>} />
        </Routes>
      </MemoryRouter>
    </SaveStatusProvider>,
  );
}

beforeEach(async () => {
  await Promise.all([db.trips.clear(), db.days.clear(), db.places.clear()]);
});

describe('TripFormPage (create)', () => {
  it('shows a validation error when the title is empty', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.click(screen.getByRole('button', { name: '作成する' }));

    expect(await screen.findByText('旅行名を入力してください')).toBeInTheDocument();
    // No trip should have been persisted.
    expect(await db.trips.count()).toBe(0);
  });

  it('creates a trip and navigates to its itinerary', async () => {
    const user = userEvent.setup();
    renderCreate();

    await user.type(screen.getByLabelText(/旅行名/), '東北の旅');
    await user.click(screen.getByRole('button', { name: '作成する' }));

    expect(await screen.findByText('旅程画面')).toBeInTheDocument();
    expect(await db.trips.count()).toBe(1);
  });
});
