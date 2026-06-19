import { useId, useRef, useState } from 'react';
import { Loader2, MapPin, Plus, Bookmark, Search, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BiasCenter, GeoPlace } from '@/domain/geocoding';
import type { GeocodingProvider } from '@/services/geocoding/GeocodingProvider';
import { geocodingMessage } from '@/services/geocoding/geocodingErrors';
import { usePlaceSearch } from './usePlaceSearch';

interface PlaceSearchProps {
  /** Geocoding service, or null when search is not configured. */
  service: GeocodingProvider | null;
  /** Add the chosen result to the current day. */
  onSelectResult: (place: GeoPlace) => void;
  /** Save the chosen result as a candidate (unscheduled). */
  onSaveAsCandidate?: (place: GeoPlace) => void;
  /** Resolve the current map center to bias ranking (optional). */
  getBias?: () => BiasCenter | null;
  /** Whether a day is currently selected (results can be added). */
  canAdd: boolean;
}

const ATTRIBUTION = (
  <p className="text-ink-faint text-[11px]">
    検索:{' '}
    <a
      href="https://www.geoapify.com/"
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2"
    >
      Powered by Geoapify
    </a>
  </p>
);

export function PlaceSearch({
  service,
  onSelectResult,
  onSaveAsCandidate,
  getBias,
  canAdd,
}: PlaceSearchProps) {
  const { state, search, reset } = usePlaceSearch({ service, getBias });
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const headingId = useId();

  // Search not configured: keep the panel, explain calmly, point to map-click.
  if (!service) {
    return (
      <section aria-labelledby={headingId} className="bg-card rounded-xl border p-3 shadow-sm">
        <h2 id={headingId} className="text-ink flex items-center gap-2 text-sm font-medium">
          <Search className="size-4" aria-hidden />
          場所を検索
        </h2>
        <p className="text-ink-soft mt-2 text-sm">検索機能の設定がありません。</p>
        <p className="text-ink-faint mt-1 text-xs">地図をクリックしてスポットを追加できます。</p>
      </section>
    );
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void search(query);
  };

  const choose = (place: GeoPlace) => {
    onSelectResult(place);
    reset();
    setQuery('');
    inputRef.current?.focus();
  };

  const saveAsCandidate = (place: GeoPlace) => {
    onSaveAsCandidate?.(place);
    reset();
    setQuery('');
    inputRef.current?.focus();
  };

  const focusResult = (index: number) => {
    const buttons = resultRefs.current;
    if (index < 0) {
      inputRef.current?.focus();
      return;
    }
    buttons[Math.min(index, buttons.length - 1)]?.focus();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      reset();
      return;
    }
    if (event.key === 'ArrowDown' && state.status === 'success' && state.results.length > 0) {
      event.preventDefault();
      focusResult(0);
    }
  };

  const handleResultKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Escape') {
      reset();
      inputRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusResult(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusResult(index - 1);
    }
  };

  return (
    <section aria-labelledby={headingId} className="bg-card rounded-xl border p-3 shadow-sm">
      <h2 id={headingId} className="text-ink flex items-center gap-2 text-sm font-medium">
        <Search className="size-4" aria-hidden />
        場所を検索
      </h2>

      <form role="search" onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="例：清水寺、東京駅"
          aria-label="場所のキーワード"
          enterKeyHint="search"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={state.status === 'loading'} className="shrink-0">
          {state.status === 'loading' ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Search aria-hidden />
          )}
          検索
        </Button>
      </form>

      <p className="text-ink-faint mt-1.5 text-[11px]">
        検索語は Geoapify へ送信されます。氏名・住所などの個人情報や機密情報は入力しないでください。
      </p>

      {!canAdd ? (
        <p className="text-ink-soft mt-2 text-xs">先に追加先の日を選択してください。</p>
      ) : null}

      {/* Live region for status changes (also rendered visibly below). */}
      <div className="mt-2" aria-live="polite">
        {state.status === 'too-short' ? (
          <p className="text-ink-soft text-xs">2文字以上入力してください。</p>
        ) : null}

        {state.status === 'loading' ? (
          <p role="status" className="text-ink-soft flex items-center gap-2 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            検索中…
          </p>
        ) : null}

        {state.status === 'error' ? (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 text-foreground flex flex-col gap-1 rounded-md border p-2.5 text-sm"
          >
            <span className="flex items-center gap-2">
              <SearchX className="text-destructive size-4 shrink-0" aria-hidden />
              {geocodingMessage(state.kind)}
            </span>
            <span className="text-ink-faint text-xs">検索ボタンでもう一度お試しください。</span>
          </div>
        ) : null}

        {state.status === 'success' && state.results.length === 0 ? (
          <p className="text-ink-soft py-2 text-sm">
            「{state.query}」に一致する場所は見つかりませんでした。
          </p>
        ) : null}

        {state.status === 'success' && state.results.length > 0 ? (
          <ul aria-label="検索結果" className="space-y-1.5">
            {state.results.map((place, index) => (
              <li key={place.id}>
                <div className="border-border flex items-start gap-2 rounded-md border p-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground flex items-center gap-1.5">
                      <span className="truncate font-medium">{place.name}</span>
                      {place.kind ? (
                        <span className="bg-secondary text-ink-soft shrink-0 rounded px-1.5 py-0.5 text-[10px]">
                          {place.kind}
                        </span>
                      ) : null}
                    </span>
                    {place.address ? (
                      <span className="text-ink-soft mt-0.5 block truncate text-xs">
                        {place.address}
                      </span>
                    ) : null}
                    <span className="text-ink-faint mt-0.5 flex items-center gap-1 text-[11px]">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      緯度 {place.latitude.toFixed(4)}・経度 {place.longitude.toFixed(4)}
                    </span>
                  </span>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      ref={(el) => {
                        resultRefs.current[index] = el;
                      }}
                      type="button"
                      onClick={() => choose(place)}
                      onKeyDown={(event) => handleResultKeyDown(event, index)}
                      disabled={!canAdd}
                      aria-label={`${place.name} を日程に追加`}
                      title="日程に追加"
                      className="text-primary hover:bg-primary/10 focus-visible:ring-ring rounded p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                    {onSaveAsCandidate && (
                      <button
                        type="button"
                        onClick={() => saveAsCandidate(place)}
                        aria-label={`${place.name} を候補に保存`}
                        title="候補に保存"
                        className="text-ink hover:bg-secondary/60 focus-visible:ring-ring rounded p-1 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <Bookmark className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-2">{ATTRIBUTION}</div>
    </section>
  );
}
