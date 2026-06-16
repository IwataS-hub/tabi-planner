import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Copy, Crosshair, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CategoryIcon } from '@/components/CategoryIcon';
import { CATEGORY_LIST } from '@/domain/categories';
import type { Place, PlaceCategory } from '@/domain/types';
import { DEFAULT_PLACE_NAME, type PlacePatch } from '@/repositories/placeRepository';
import { isHttpUrl, parseNonNegativeIntOrNull } from '@/lib/utils';

interface PlaceEditorProps {
  place: Place;
  onSave: (id: string, patch: PlacePatch) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFocusOnMap: () => void;
}

interface PlaceForm {
  name: string;
  category: PlaceCategory;
  startTime: string;
  stayMinutes: string;
  travelMinutes: string;
  estimatedCost: string;
  memo: string;
  url: string;
}

function toForm(place: Place): PlaceForm {
  return {
    name: place.name,
    category: place.category,
    startTime: place.startTime ?? '',
    stayMinutes: place.stayMinutes?.toString() ?? '',
    travelMinutes: place.travelMinutes?.toString() ?? '',
    estimatedCost: place.estimatedCost?.toString() ?? '',
    memo: place.memo,
    url: place.url,
  };
}

/** Build a patch of only the fields that changed; skip an invalid URL. */
function buildPatch(current: PlaceForm, saved: PlaceForm): PlacePatch | null {
  const patch: PlacePatch = {};
  if (current.name !== saved.name) patch.name = current.name.trim() || DEFAULT_PLACE_NAME;
  if (current.category !== saved.category) patch.category = current.category;
  if (current.startTime !== saved.startTime) {
    patch.startTime = current.startTime === '' ? null : current.startTime;
  }
  if (current.stayMinutes !== saved.stayMinutes) {
    patch.stayMinutes = parseNonNegativeIntOrNull(current.stayMinutes);
  }
  if (current.travelMinutes !== saved.travelMinutes) {
    patch.travelMinutes = parseNonNegativeIntOrNull(current.travelMinutes);
  }
  if (current.estimatedCost !== saved.estimatedCost) {
    patch.estimatedCost = parseNonNegativeIntOrNull(current.estimatedCost);
  }
  if (current.memo !== saved.memo) patch.memo = current.memo;
  if (current.url !== saved.url && (current.url === '' || isHttpUrl(current.url))) {
    patch.url = current.url;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Inline editor for a single place with debounced autosave. Mounted keyed by
 * place id, so initial state is taken from props once; subsequent edits live in
 * local state and are flushed to the repository after a short pause (and on
 * unmount, e.g. when another place is selected).
 */
export function PlaceEditor({
  place,
  onSave,
  onDuplicate,
  onDelete,
  onFocusOnMap,
}: PlaceEditorProps) {
  const fieldId = useId();
  const [form, setForm] = useState<PlaceForm>(() => toForm(place));
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Snapshot of the last persisted form (written only inside flush, never
  // during render). `latestRef` mirrors the current props/state and is updated
  // in an effect so flush can read fresh values without render-time ref writes.
  const savedRef = useRef<PlaceForm>(form);
  const latestRef = useRef<{ form: PlaceForm; onSave: PlaceEditorProps['onSave'] }>({
    form,
    onSave,
  });
  useEffect(() => {
    latestRef.current = { form, onSave };
  });

  const flush = useCallback(() => {
    const { form: current, onSave: save } = latestRef.current;
    const patch = buildPatch(current, savedRef.current);
    if (!patch) return;
    // Advance the saved snapshot, but keep the old URL if the new one is invalid
    // so a later correction is still detected as a change.
    savedRef.current = {
      ...current,
      url: current.url === '' || isHttpUrl(current.url) ? current.url : savedRef.current.url,
    };
    save(place.id, patch);
  }, [place.id]);

  // Debounced save on every change.
  useEffect(() => {
    const timer = setTimeout(flush, 600);
    return () => clearTimeout(timer);
  }, [form, flush]);

  // Flush any pending change when unmounting (switching place / closing).
  useEffect(() => () => flush(), [flush]);

  const update = (patch: Partial<PlaceForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const urlInvalid = form.url !== '' && !isHttpUrl(form.url);
  const nameEmpty = form.name.trim() === '';

  return (
    <div className="border-border space-y-4 border-t pt-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-name`}>名称</Label>
        <Input
          id={`${fieldId}-name`}
          value={form.name}
          onChange={(event) => update({ name: event.target.value })}
          placeholder={DEFAULT_PLACE_NAME}
          onBlur={flush}
        />
        {nameEmpty ? (
          <p className="text-muted-foreground text-xs">
            空のままにすると「{DEFAULT_PLACE_NAME}」として保存されます。
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-category`}>カテゴリ</Label>
          <Select
            value={form.category}
            onValueChange={(value) => update({ category: value as PlaceCategory })}
          >
            <SelectTrigger id={`${fieldId}-category`} aria-label="カテゴリ">
              <span className="flex items-center gap-2">
                <CategoryIcon category={form.category} className="size-4" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_LIST.map((meta) => (
                <SelectItem key={meta.key} value={meta.key}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: meta.color }}
                    />
                    {meta.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-start`}>開始時刻</Label>
          <Input
            id={`${fieldId}-start`}
            type="time"
            value={form.startTime}
            onChange={(event) => update({ startTime: event.target.value })}
            onBlur={flush}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-stay`}>滞在時間（分）</Label>
          <Input
            id={`${fieldId}-stay`}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.stayMinutes}
            onChange={(event) => update({ stayMinutes: event.target.value })}
            onBlur={flush}
            placeholder="例：60"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-travel`}>次への移動（分）</Label>
          <Input
            id={`${fieldId}-travel`}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.travelMinutes}
            onChange={(event) => update({ travelMinutes: event.target.value })}
            onBlur={flush}
            placeholder="手動入力"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-cost`}>予算（円）</Label>
          <Input
            id={`${fieldId}-cost`}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.estimatedCost}
            onChange={(event) => update({ estimatedCost: event.target.value })}
            onBlur={flush}
            placeholder="例：1500"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-url`}>関連URL</Label>
        <Input
          id={`${fieldId}-url`}
          type="url"
          inputMode="url"
          value={form.url}
          onChange={(event) => update({ url: event.target.value })}
          onBlur={flush}
          placeholder="https://example.com"
          aria-invalid={urlInvalid}
          aria-describedby={urlInvalid ? `${fieldId}-url-error` : undefined}
        />
        {urlInvalid ? (
          <p id={`${fieldId}-url-error`} className="text-destructive text-xs">
            http(s):// から始まるURLを入力してください（この項目は保存されません）。
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${fieldId}-memo`}>メモ</Label>
        <Textarea
          id={`${fieldId}-memo`}
          value={form.memo}
          onChange={(event) => update({ memo: event.target.value })}
          onBlur={flush}
          rows={3}
          placeholder="予約状況、行きたい理由など"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onFocusOnMap}>
          <Crosshair aria-hidden />
          地図で中央に
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDuplicate}>
          <Copy aria-hidden />
          複製
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 aria-hidden />
          削除
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="このスポットを削除しますか？"
        description={`「${place.name}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        destructive
        onConfirm={onDelete}
      />
    </div>
  );
}
