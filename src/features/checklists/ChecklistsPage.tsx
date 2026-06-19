import { useState, useId } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2, Check, Pencil, Filter, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { ItineraryHeader } from '@/features/itinerary/ItineraryHeader';
import { TripNav } from '@/features/itinerary/TripNav';
import type { ChecklistItem, ChecklistKind } from '@/domain/types';
import { getWeatherAdvice, getWeatherSuggestions } from '@/domain/weather';
import type { DayWeather } from '@/domain/weather';
import { useSaveStatus } from '@/hooks/useSaveStatus';
import {
  useTrip,
  useTripChecklist,
  useTripParticipants,
  useTripDays,
  useTripPlaces,
} from '@/hooks/useTripData';
import {
  checklistItemRepository,
  type ChecklistItemDraft,
} from '@/repositories/checklistItemRepository';
import { fetchTripWeather, representativeCoordinate } from '@/services/weather/weatherService';
import { WeatherError } from '@/services/weather/weatherErrors';

const KIND_LABELS: Record<ChecklistKind, string> = {
  packing: '持ち物',
  todo: 'ToDo',
};

function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ChecklistsPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { track } = useSaveStatus();

  const trip = useTrip(tripId);
  const packingItems = useTripChecklist(tripId, 'packing');
  const todoItems = useTripChecklist(tripId, 'todo');
  const participants = useTripParticipants(tripId);
  const days = useTripDays(tripId);
  const places = useTripPlaces(tripId);

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [addingKind, setAddingKind] = useState<ChecklistKind | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ChecklistKind>('packing');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ title: string; category: string }>>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');

  if (trip.status === 'loading') {
    return (
      <PageShell>
        <LoadingView label="読み込み中…" />
      </PageShell>
    );
  }
  if (trip.status === 'error' || !trip.data) {
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

  const tripData = trip.data;
  const participantList = participants.data ?? [];
  const dayList = days.data ?? [];
  const placeList = places.data ?? [];
  const placesByDay = Object.fromEntries(
    dayList.map((d) => [d.id, placeList.filter((p) => p.dayId === d.id)]),
  );

  const handleFetchSuggestions = async () => {
    setSuggestionsError('');
    setLoadingSuggestions(true);
    const coord = representativeCoordinate(dayList, placesByDay);
    if (!coord || coord.latitude == null) {
      setSuggestionsError('スポットの座標情報がないため天気を取得できません');
      setLoadingSuggestions(false);
      return;
    }
    const today = todayJst();
    try {
      const weather = await fetchTripWeather(coord, tripData.startDate, tripData.endDate, today);
      if (!weather || weather.daily.length === 0) {
        setSuggestionsError('天気データがありません');
        return;
      }
      const allAdvice = weather.daily.map((d: DayWeather) => getWeatherAdvice(d));
      const merged = {
        umbrella: allAdvice.some((a) => a.umbrella),
        heavyRain: allAdvice.some((a) => a.heavyRain),
        heat: allAdvice.some((a) => a.heat),
        cold: allAdvice.some((a) => a.cold),
        highUv: allAdvice.some((a) => a.highUv),
        strongWind: allAdvice.some((a) => a.strongWind),
      };
      setSuggestions(getWeatherSuggestions(merged));
    } catch (err) {
      if (err instanceof WeatherError && err.kind === 'out-of-range') {
        setSuggestionsError('旅行日程が予報範囲外です');
      } else {
        setSuggestionsError('天気情報の取得に失敗しました');
      }
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleAddSuggestion = async (suggestion: { title: string; category: string }) => {
    if (!tripId) return;
    await track(() => checklistItemRepository.addSuggestions(tripId, 'packing', [suggestion]));
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
  };

  const renderList = (items: ChecklistItem[], kind: ChecklistKind) => {
    const incomplete = items.filter((item) => !item.completed);
    const complete = items.filter((item) => item.completed);
    const displayed = showIncompleteOnly ? incomplete : [...incomplete, ...complete];

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-soft text-xs">
            未完了 {incomplete.length}件 / 完了 {complete.length}件
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={showIncompleteOnly ? 'default' : 'outline'}
              onClick={() => setShowIncompleteOnly((v) => !v)}
              aria-pressed={showIncompleteOnly}
            >
              <Filter className="mr-1 size-3.5" aria-hidden />
              未完了のみ
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddingKind(kind)}>
              <Plus className="mr-1 size-3.5" aria-hidden />
              追加
            </Button>
          </div>
        </div>

        {addingKind === kind && (
          <ItemForm
            tripId={tripId!}
            kind={kind}
            participants={participantList}
            onSave={async (draft) => {
              await track(() => checklistItemRepository.add(draft));
              setAddingKind(null);
            }}
            onCancel={() => setAddingKind(null)}
          />
        )}

        {/* Weather suggestions panel (packing only) */}
        {kind === 'packing' && (
          <div className="space-y-2 rounded-xl border border-dashed p-3">
            <div className="flex items-center justify-between">
              <span className="text-ink-soft flex items-center gap-1 text-xs font-medium">
                <Lightbulb className="size-3.5" aria-hidden />
                天気由来の持ち物候補
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void handleFetchSuggestions()}
                disabled={loadingSuggestions}
              >
                {loadingSuggestions ? '取得中…' : '天気から提案'}
              </Button>
            </div>
            {suggestionsError && <p className="text-destructive text-xs">{suggestionsError}</p>}
            {suggestions.length > 0 && (
              <ul className="space-y-1">
                {suggestions.map((s) => (
                  <li
                    key={s.title}
                    className="flex items-center justify-between rounded-lg bg-sky-50 px-2 py-1 text-xs"
                  >
                    <span>
                      {s.title}
                      {s.category && <span className="text-ink-soft ml-1">({s.category})</span>}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
                      onClick={() => void handleAddSuggestion(s)}
                    >
                      追加
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {suggestions.length === 0 && !loadingSuggestions && !suggestionsError && (
              <p className="text-ink-soft text-xs">「天気から提案」をタップして候補を取得します</p>
            )}
          </div>
        )}

        {displayed.length === 0 ? (
          <p className="text-ink-soft py-4 text-center text-sm">
            {showIncompleteOnly
              ? '未完了の項目はありません。'
              : `${KIND_LABELS[kind]}はありません。`}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {displayed.map((item) => {
              const assignee = participantList.find((p) => p.id === item.assigneeId);
              if (editingItemId === item.id) {
                return (
                  <li key={item.id}>
                    <ItemForm
                      tripId={tripId!}
                      kind={kind}
                      participants={participantList}
                      initial={item}
                      onSave={async (draft) => {
                        await track(() =>
                          checklistItemRepository.update(item.id, {
                            title: draft.title,
                            category: draft.category ?? '',
                            assigneeId: draft.assigneeId ?? null,
                            dueAt: draft.dueAt ?? null,
                          }),
                        );
                        setEditingItemId(null);
                      }}
                      onCancel={() => setEditingItemId(null)}
                    />
                  </li>
                );
              }
              return (
                <li
                  key={item.id}
                  className={`bg-card flex items-start gap-2 rounded-xl border px-3 py-2 ${item.completed ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    aria-label={item.completed ? '未完了にする' : '完了にする'}
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                      item.completed
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border'
                    }`}
                    onClick={() =>
                      void track(() =>
                        checklistItemRepository.setCompleted(item.id, !item.completed),
                      )
                    }
                  >
                    {item.completed && <Check className="size-3" aria-hidden />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-foreground text-sm ${item.completed ? 'line-through' : ''}`}
                    >
                      {item.title}
                    </p>
                    <div className="text-ink-soft flex flex-wrap gap-2 text-xs">
                      {item.category && (
                        <span className="rounded bg-neutral-100 px-1">{item.category}</span>
                      )}
                      {assignee && <span>担当: {assignee.name}</span>}
                      {item.dueAt && <span>期日: {item.dueAt}</span>}
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${item.title}を編集`}
                    onClick={() => setEditingItemId(item.id)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`${item.title}を削除`}
                    onClick={() => setDeleteItemId(item.id)}
                  >
                    <Trash2 className="text-destructive size-3.5" aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ItineraryHeader trip={tripData} />
      <TripNav tripId={tripData.id} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChecklistKind)}>
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="packing" className="flex-1">
                持ち物
              </TabsTrigger>
              <TabsTrigger value="todo" className="flex-1">
                ToDo
              </TabsTrigger>
            </TabsList>
            <TabsContent value="packing">
              {renderList(packingItems.data ?? [], 'packing')}
            </TabsContent>
            <TabsContent value="todo">{renderList(todoItems.data ?? [], 'todo')}</TabsContent>
          </Tabs>
        </div>
      </div>

      <ConfirmDialog
        open={deleteItemId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteItemId(null);
        }}
        title="項目を削除しますか？"
        description="この操作は取り消せません。"
        confirmLabel="削除"
        destructive
        onConfirm={() => {
          if (deleteItemId) void track(() => checklistItemRepository.remove(deleteItemId));
          setDeleteItemId(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit item form
// ---------------------------------------------------------------------------

interface ItemFormProps {
  tripId: string;
  kind: ChecklistKind;
  participants: { id: string; name: string }[];
  initial?: ChecklistItem;
  onSave: (draft: ChecklistItemDraft) => Promise<void>;
  onCancel: () => void;
}

function ItemForm({ tripId, kind, participants, initial, onSave, onCancel }: ItemFormProps) {
  const fieldId = useId();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '');
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        tripId,
        kind,
        title: title.trim(),
        category: category.trim(),
        assigneeId: assigneeId || null,
        dueAt: dueAt || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-secondary/30 space-y-3 rounded-xl border p-3">
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-title`}>タイトル</Label>
        <Input
          id={`${fieldId}-title`}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'packing' ? '例：折りたたみ傘' : '例：ホテルを予約する'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-cat`}>カテゴリ（任意）</Label>
          <Input
            id={`${fieldId}-cat`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="例：衣類"
          />
        </div>
        {participants.length > 0 && (
          <div className="space-y-1">
            <Label htmlFor={`${fieldId}-assignee`}>担当者（任意）</Label>
            <select
              id={`${fieldId}-assignee`}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="border-input bg-background text-foreground h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">指定なし</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {kind === 'todo' && (
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-due`}>期日（任意）</Label>
          <Input
            id={`${fieldId}-due`}
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void handleSubmit()} disabled={!title.trim() || saving}>
          {initial ? '保存' : '追加'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-10">{children}</main>
    </div>
  );
}
