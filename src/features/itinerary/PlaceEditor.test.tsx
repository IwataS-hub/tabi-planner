import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Place } from '@/domain/types';
import { PlaceEditor } from './PlaceEditor';

const ISO = '2026-06-16T00:00:00.000Z';

function makePlace(over: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    tripId: 't1',
    dayId: 'd1',
    name: '清水寺',
    category: 'sightseeing',
    latitude: 35,
    longitude: 135,
    address: null,
    startTime: null,
    stayMinutes: null,
    travelMinutes: null,
    memo: '',
    url: '',
    estimatedCost: null,
    travelMode: null,
    travelDistanceMeters: null,
    travelEstimateSource: null,
    travelToPlaceId: null,
    travelRouteKey: null,
    travelCalculatedAt: null,
    order: 0,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function renderEditor(place: Place, onSave = vi.fn()) {
  return {
    onSave,
    ...render(
      <PlaceEditor
        place={place}
        onSave={onSave}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocusOnMap={vi.fn()}
      />,
    ),
  };
}

describe('PlaceEditor travelMinutes synchronisation', () => {
  it('reflects an external auto estimate without writing stale local state back', async () => {
    const onSave = vi.fn();
    const { rerender } = renderEditor(makePlace(), onSave);

    rerender(
      <PlaceEditor
        place={makePlace({ travelMinutes: 18, travelEstimateSource: 'auto' })}
        onSave={onSave}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocusOnMap={vi.fn()}
      />,
    );

    const input = await screen.findByLabelText('次への移動（分）');
    await waitFor(() => expect(input).toHaveValue(18));
    fireEvent.blur(input);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not clobber a user-edited travel time with a late auto estimate', async () => {
    const onSave = vi.fn();
    const { rerender } = renderEditor(makePlace(), onSave);
    const input = screen.getByLabelText('次への移動（分）');

    fireEvent.change(input, { target: { value: '9' } });
    rerender(
      <PlaceEditor
        place={makePlace({ travelMinutes: 18, travelEstimateSource: 'auto' })}
        onSave={onSave}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onFocusOnMap={vi.fn()}
      />,
    );

    expect(input).toHaveValue(9);
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('p1', { travelMinutes: 9 });
  });
});
