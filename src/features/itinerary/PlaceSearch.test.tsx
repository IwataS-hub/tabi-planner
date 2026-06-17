import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GeoPlace } from '@/domain/geocoding';
import type { GeocodingProvider } from '@/services/geocoding/GeocodingProvider';
import { GeocodingError } from '@/services/geocoding/geocodingErrors';
import { PlaceSearch } from './PlaceSearch';

function sampleResult(): GeoPlace {
  return {
    id: 'abc123',
    name: '清水寺',
    address: '京都府京都市東山区清水1丁目294',
    latitude: 34.9948,
    longitude: 135.785,
    kind: '施設',
    city: '京都市',
    prefecture: '京都府',
  };
}

function makeService(overrides: Partial<GeocodingProvider> = {}): GeocodingProvider {
  return {
    search: vi.fn().mockResolvedValue([]),
    reverse: vi.fn().mockResolvedValue({ name: null, address: null }),
    ...overrides,
  };
}

describe('PlaceSearch', () => {
  it('renders a gentle notice and no search box when not configured', () => {
    render(<PlaceSearch service={null} onSelectResult={vi.fn()} canAdd />);
    expect(screen.getByText('検索機能の設定がありません。')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  it('does not call the API when the query is too short', async () => {
    const user = userEvent.setup();
    const service = makeService();
    render(<PlaceSearch service={service} onSelectResult={vi.fn()} canAdd />);

    await user.type(screen.getByRole('searchbox'), 'x');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(service.search).not.toHaveBeenCalled();
    expect(await screen.findByText('2文字以上入力してください。')).toBeInTheDocument();
  });

  it('searches and adds the chosen result', async () => {
    const user = userEvent.setup();
    const onSelectResult = vi.fn();
    const result = sampleResult();
    const service = makeService({ search: vi.fn().mockResolvedValue([result]) });
    render(<PlaceSearch service={service} onSelectResult={onSelectResult} canAdd />);

    await user.type(screen.getByRole('searchbox'), '清水寺');
    await user.click(screen.getByRole('button', { name: '検索' }));

    const option = await screen.findByRole('button', { name: /清水寺/ });
    await user.click(option);
    expect(onSelectResult).toHaveBeenCalledWith(result);
  });

  it('shows an error message on the screen when the search fails', async () => {
    const user = userEvent.setup();
    const service = makeService({
      search: vi.fn().mockRejectedValue(new GeocodingError('rate-limit')),
    });
    render(<PlaceSearch service={service} onSelectResult={vi.fn()} canAdd />);

    await user.type(screen.getByRole('searchbox'), '京都');
    await user.click(screen.getByRole('button', { name: '検索' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('利用上限');
  });

  it('shows an empty state when there are no matches', async () => {
    const user = userEvent.setup();
    const service = makeService({ search: vi.fn().mockResolvedValue([]) });
    render(<PlaceSearch service={service} onSelectResult={vi.fn()} canAdd />);

    await user.type(screen.getByRole('searchbox'), '存在しない場所');
    await user.click(screen.getByRole('button', { name: '検索' }));

    expect(await screen.findByText(/見つかりませんでした/)).toBeInTheDocument();
  });

  it('shows the Geoapify attribution', () => {
    render(<PlaceSearch service={makeService()} onSelectResult={vi.fn()} canAdd />);
    expect(screen.getByText('Powered by Geoapify')).toBeInTheDocument();
  });
});
