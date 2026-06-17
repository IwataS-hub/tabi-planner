import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db } from '@/db/database';
import { placeRepository } from '@/repositories/placeRepository';
import { tripRepository } from '@/repositories/tripRepository';
import { ImportTripButton } from './ImportTripButton';

beforeEach(async () => {
  await Promise.all([db.trips.clear(), db.days.clear(), db.places.clear()]);
});

/** Build a backup File from a trip, then remove the trip so the import is clean. */
async function makeBackupFile(): Promise<File> {
  const trip = await tripRepository.create({
    title: '四国旅行',
    description: '',
    startDate: '2026-07-01',
    endDate: '2026-07-01',
  });
  const days = await tripRepository.listDays(trip.id);
  await placeRepository.add({
    tripId: trip.id,
    dayId: days[0].id,
    latitude: 33.85,
    longitude: 132.78,
    name: '道後温泉',
  });
  const backup = await tripRepository.exportTrip(trip.id);
  await tripRepository.remove(trip.id);
  return new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error('file input not found');
  return input as HTMLInputElement;
}

describe('ImportTripButton', () => {
  it('imports a valid backup as a new trip', async () => {
    const user = userEvent.setup();
    const file = await makeBackupFile();
    render(<ImportTripButton />);

    await user.upload(fileInput(), file);

    await waitFor(async () => {
      expect(await db.trips.count()).toBe(1);
    });
    const places = await db.places.toArray();
    expect(places.map((p) => p.name)).toEqual(['道後温泉']);
  });

  it('shows an error dialog (not toast-only) for an invalid file', async () => {
    const user = userEvent.setup();
    render(<ImportTripButton />);

    const bad = new File(['this is not json'], 'bad.json', { type: 'application/json' });
    await user.upload(fileInput(), bad);

    expect(await screen.findByText('読み込みできませんでした')).toBeInTheDocument();
    expect(await screen.findByText(/JSONとして読み込めませんでした/)).toBeInTheDocument();
    expect(await db.trips.count()).toBe(0);
  });
});
