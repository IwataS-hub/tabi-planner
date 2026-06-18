import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { routeKey, type RouteEstimate } from '@/domain/routing';
import type { Place } from '@/domain/types';
import type { RoutingProvider } from '@/services/routing/RoutingProvider';
import { RoutingError } from '@/services/routing/routingErrors';
import { TravelLegRow } from './TravelLegRow';
import { PlaceList } from './PlaceList';

const ISO = '2026-06-16T00:00:00.000Z';

function makePlace(over: Partial<Place> & { id: string }): Place {
  return {
    tripId: 't',
    dayId: 'd',
    name: over.id,
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

const FROM = makePlace({ id: 'A', name: 'A', latitude: 35.0, longitude: 135.0 });
const TO = makePlace({ id: 'B', name: 'B', latitude: 35.1, longitude: 135.1 });

function estimate(): RouteEstimate {
  return {
    timeSeconds: 1080,
    distanceMeters: 1300,
    geometry: [
      { latitude: 35.0, longitude: 135.0 },
      { latitude: 35.1, longitude: 135.1 },
    ],
  };
}

function makeService(over: Partial<RoutingProvider> = {}): RoutingProvider {
  return { route: vi.fn().mockResolvedValue(estimate()), ...over };
}

function renderRow(props: Partial<React.ComponentProps<typeof TravelLegRow>> = {}) {
  return render(
    <ul>
      <TravelLegRow
        fromPlace={FROM}
        toPlace={TO}
        service={makeService()}
        selected={false}
        onSelect={vi.fn()}
        onResult={vi.fn()}
        {...props}
      />
    </ul>,
  );
}

describe('TravelLegRow', () => {
  it('calculates with the chosen mode and reports the estimate', async () => {
    const user = userEvent.setup();
    const route = vi.fn().mockResolvedValue(estimate());
    const onResult = vi.fn();
    renderRow({ service: makeService({ route }), onResult });

    await user.selectOptions(screen.getByRole('combobox'), 'drive');
    await user.click(screen.getByRole('button', { name: /ルートを計算/ }));

    await waitFor(() => expect(route).toHaveBeenCalledTimes(1));
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { latitude: 35.0, longitude: 135.0 },
        to: { latitude: 35.1, longitude: 135.1 },
        mode: 'drive',
      }),
    );
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith(
      FROM,
      TO,
      'drive',
      expect.objectContaining({ timeSeconds: 1080 }),
    );
  });

  it('labels the public-transit option as a reference estimate', () => {
    renderRow();
    expect(screen.getByRole('option', { name: '公共交通（参考）' })).toBeInTheDocument();
  });

  it('shows time, distance and an "auto" badge for an auto estimate', () => {
    const from = makePlace({
      id: 'A',
      name: 'A',
      latitude: 35.0,
      longitude: 135.0,
      travelMinutes: 18,
      travelMode: 'walk',
      travelDistanceMeters: 1300,
      travelEstimateSource: 'auto',
      travelToPlaceId: 'B',
      travelRouteKey: routeKey(
        { latitude: 35.0, longitude: 135.0 },
        { latitude: 35.1, longitude: 135.1 },
        'walk',
      ),
    });
    renderRow({ fromPlace: from });
    const result = screen.getByRole('button', { name: /地図で表示/ });
    expect(result).toHaveTextContent('徒歩');
    expect(result).toHaveTextContent('18分・1.3km');
    expect(screen.getByText('自動')).toBeInTheDocument();
  });

  it('labels a manual time as 手入力 without distance', () => {
    const from = makePlace({
      id: 'A',
      name: 'A',
      travelMinutes: 25,
      travelEstimateSource: 'manual',
    });
    renderRow({ fromPlace: from });
    expect(screen.getByText('手入力')).toBeInTheDocument();
    expect(screen.getByText(/25分/)).toBeInTheDocument();
  });

  it('marks a public-transit estimate as 参考', () => {
    const from = makePlace({
      id: 'A',
      name: 'A',
      latitude: 35.0,
      longitude: 135.0,
      travelMinutes: 30,
      travelMode: 'transit',
      travelDistanceMeters: 5000,
      travelEstimateSource: 'auto',
      travelToPlaceId: 'B',
      travelRouteKey: routeKey(
        { latitude: 35.0, longitude: 135.0 },
        { latitude: 35.1, longitude: 135.1 },
        'transit',
      ),
    });
    renderRow({ fromPlace: from });
    expect(screen.getByText('（参考）')).toBeInTheDocument();
  });

  it('shows a stale notice when the auto estimate no longer matches the segment', () => {
    const from = makePlace({
      id: 'A',
      name: 'A',
      travelMinutes: 18,
      travelMode: 'walk',
      travelEstimateSource: 'auto',
      travelToPlaceId: 'someone-else', // not TO.id
      travelRouteKey: 'stale',
    });
    renderRow({ fromPlace: from });
    expect(screen.getByText(/区間が変わりました/)).toBeInTheDocument();
  });

  it('shows an on-screen error (not a toast) when the request fails', async () => {
    const user = userEvent.setup();
    const route = vi.fn().mockRejectedValue(new RoutingError('rate-limit'));
    renderRow({ service: makeService({ route }) });

    await user.click(screen.getByRole('button', { name: /ルートを計算/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('利用上限');
  });

  it('shows a specific no-route message without clearing an existing manual time', async () => {
    const user = userEvent.setup();
    const route = vi.fn().mockRejectedValue(new RoutingError('no-route'));
    const from = makePlace({
      id: 'A',
      name: 'A',
      travelMinutes: 25,
      travelEstimateSource: 'manual',
    });
    renderRow({ fromPlace: from, service: makeService({ route }) });

    await user.selectOptions(screen.getByRole('combobox'), 'transit');
    await user.click(screen.getByRole('button', { name: /再計算/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'この区間では公共交通ルートを取得できませんでした。徒歩・自動車・自転車、または移動時間の手入力をお試しください。',
    );
    expect(screen.getByText('手入力')).toBeInTheDocument();
    expect(screen.getByText(/25分/)).toBeInTheDocument();
  });

  it('does not fire a second request while one is in flight', async () => {
    const user = userEvent.setup();
    // Never resolves → stays in the loading state.
    const route = vi.fn().mockReturnValue(new Promise<RouteEstimate>(() => {}));
    renderRow({ service: makeService({ route }) });

    const button = screen.getByRole('button', { name: /ルートを計算/ });
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button); // no-op while disabled
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('explains that manual entry is available when routing is not configured', () => {
    renderRow({ service: null });
    expect(screen.queryByRole('button', { name: /ルートを計算/ })).not.toBeInTheDocument();
    expect(screen.getByText(/手入力できます/)).toBeInTheDocument();
  });
});

describe('PlaceList travel legs', () => {
  const baseProps = {
    selectedPlaceId: null,
    onSelect: vi.fn(),
    onReorder: vi.fn(),
    onSave: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onFocusOnMap: vi.fn(),
    routingService: null,
    selectedLegId: null,
    onSelectLeg: vi.fn(),
    onLegResult: vi.fn(),
  };

  it('renders one leg between adjacent places and none after the last', () => {
    const places = [
      makePlace({ id: 'A', name: 'A', order: 0 }),
      makePlace({ id: 'B', name: 'B', order: 1 }),
      makePlace({ id: 'C', name: 'C', order: 2 }),
    ];
    render(<PlaceList places={places} {...baseProps} />);
    const legs = screen.getAllByRole('group', { name: /への移動/ });
    expect(legs).toHaveLength(2); // A→B, B→C — nothing after C
  });
});
