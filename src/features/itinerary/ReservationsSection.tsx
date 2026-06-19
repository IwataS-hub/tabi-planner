import { useState } from 'react';
import {
  Hotel,
  Train,
  UtensilsCrossed,
  Calendar,
  Activity,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { Reservation, ReservationKind, TripDay } from '@/domain/types';
import { RESERVATION_KINDS } from '@/domain/types';

const KIND_LABELS: Record<ReservationKind, string> = {
  lodging: '宿泊',
  transport: '交通',
  restaurant: 'レストラン',
  event: 'イベント',
  activity: 'アクティビティ',
  other: 'その他',
};

const KIND_ICONS: Record<ReservationKind, typeof Hotel> = {
  lodging: Hotel,
  transport: Train,
  restaurant: UtensilsCrossed,
  event: Calendar,
  activity: Activity,
  other: MoreHorizontal,
};

interface ReservationFormData {
  kind: ReservationKind;
  title: string;
  dayId: string;
  startAt: string;
  endAt: string;
  location: string;
  confirmationCode: string;
  url: string;
  phone: string;
  memo: string;
  isPrivate: boolean;
}

const EMPTY_FORM: ReservationFormData = {
  kind: 'lodging',
  title: '',
  dayId: '',
  startAt: '',
  endAt: '',
  location: '',
  confirmationCode: '',
  url: '',
  phone: '',
  memo: '',
  isPrivate: false,
};

function toLocalDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  // Format as YYYY-MM-DDTHH:mm in local timezone
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDateTimeInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface ReservationEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  days: TripDay[];
  initial?: Reservation | null;
  onSave: (data: ReservationFormData) => void;
}

function ReservationEditor({ open, onOpenChange, days, initial, onSave }: ReservationEditorProps) {
  const [form, setForm] = useState<ReservationFormData>(() =>
    initial
      ? {
          kind: initial.kind,
          title: initial.title,
          dayId: initial.dayId ?? '',
          startAt: toLocalDateTimeInput(initial.startAt),
          endAt: toLocalDateTimeInput(initial.endAt),
          location: initial.location,
          confirmationCode: initial.confirmationCode,
          url: initial.url,
          phone: initial.phone,
          memo: initial.memo,
          isPrivate: initial.isPrivate,
        }
      : EMPTY_FORM,
  );

  const set = <K extends keyof ReservationFormData>(k: K, v: ReservationFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? '予約を編集' : '予約を追加'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="res-kind">種別</Label>
              <Select value={form.kind} onValueChange={(v) => set('kind', v as ReservationKind)}>
                <SelectTrigger id="res-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESERVATION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="res-day">日程</Label>
              <Select value={form.dayId} onValueChange={(v) => set('dayId', v)}>
                <SelectTrigger id="res-day">
                  <SelectValue placeholder="未割当" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未割当</SelectItem>
                  {days.map((d, i) => (
                    <SelectItem key={d.id} value={d.id}>
                      Day {i + 1} ({d.date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="res-title">名称 *</Label>
            <Input
              id="res-title"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="ホテル名、便名など"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="res-start">開始日時</Label>
              <Input
                id="res-start"
                type="datetime-local"
                value={form.startAt}
                onChange={(e) => set('startAt', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="res-end">終了日時</Label>
              <Input
                id="res-end"
                type="datetime-local"
                value={form.endAt}
                onChange={(e) => set('endAt', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="res-location">場所</Label>
            <Input
              id="res-location"
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="res-code">予約番号</Label>
            <Input
              id="res-code"
              value={form.confirmationCode}
              onChange={(e) => set('confirmationCode', e.target.value)}
              placeholder="確認番号・予約ID"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="res-url">URL</Label>
              <Input
                id="res-url"
                type="url"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="res-phone">電話番号</Label>
              <Input
                id="res-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="res-memo">メモ</Label>
            <Textarea
              id="res-memo"
              value={form.memo}
              onChange={(e) => set('memo', e.target.value)}
              rows={2}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPrivate}
              onChange={(e) => set('isPrivate', e.target.checked)}
              className="rounded"
            />
            プライベート情報として扱う
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              キャンセル
            </Button>
            <Button type="submit">保存</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ReservationCardProps {
  reservation: Reservation;
  onEdit: () => void;
  onDelete: () => void;
}

function formatReservationTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ReservationCard({ reservation: res, onEdit, onDelete }: ReservationCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const Icon = KIND_ICONS[res.kind];
  const timeStr = res.startAt
    ? `${formatReservationTime(res.startAt)}${res.endAt ? ` 〜 ${formatReservationTime(res.endAt)}` : ''}`
    : '';

  return (
    <>
      <div className="bg-card rounded-lg border px-3 py-2 shadow-sm">
        <div className="flex items-start gap-2">
          <span className="bg-muted mt-0.5 rounded p-1">
            <Icon className="text-muted-foreground size-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{res.title}</span>
              <span className="text-muted-foreground shrink-0 text-[10px]">
                {KIND_LABELS[res.kind]}
              </span>
              {res.isPrivate && (
                <span
                  className="shrink-0 text-amber-600"
                  aria-label="プライベート"
                  title="プライベート"
                >
                  <Lock className="size-3" />
                </span>
              )}
            </div>
            {timeStr && <p className="text-ink-soft text-xs">{timeStr}</p>}
            {res.location && <p className="text-ink-soft truncate text-xs">{res.location}</p>}
            {res.confirmationCode && (
              <p className="text-ink-soft font-mono text-xs">予約番号: {res.confirmationCode}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${res.title} の操作`}
                className="-mr-1 shrink-0"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil aria-hidden />
                編集
              </DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                <Trash2 aria-hidden />
                削除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="この予約を削除しますか？"
        description={`「${res.title}」が削除されます。この操作は取り消せません。`}
        confirmLabel="削除する"
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}

export interface ReservationSaveInput {
  kind: ReservationKind;
  title: string;
  dayId: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string;
  confirmationCode: string;
  url: string;
  phone: string;
  memo: string;
  isPrivate: boolean;
}

interface ReservationsSectionProps {
  reservations: Reservation[];
  days: TripDay[];
  onAdd: (input: ReservationSaveInput) => void;
  onEdit: (id: string, input: ReservationSaveInput) => void;
  onDelete: (id: string) => void;
}

export function ReservationsSection({
  reservations,
  days,
  onAdd,
  onEdit,
  onDelete,
}: ReservationsSectionProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Reservation | null>(null);

  function formToInput(f: ReservationFormData): ReservationSaveInput {
    return {
      kind: f.kind,
      title: f.title.trim(),
      dayId: f.dayId || null,
      startAt: fromLocalDateTimeInput(f.startAt),
      endAt: fromLocalDateTimeInput(f.endAt),
      location: f.location.trim(),
      confirmationCode: f.confirmationCode.trim(),
      url: f.url.trim(),
      phone: f.phone.trim(),
      memo: f.memo.trim(),
      isPrivate: f.isPrivate,
    };
  }

  return (
    <section aria-labelledby="reservations-heading">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="reservations-heading" className="text-sm font-semibold">
          予約
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="size-3.5" aria-hidden />
          追加
        </Button>
      </div>

      {reservations.length === 0 ? (
        <p className="text-ink-faint py-2 text-center text-xs">予約はありません</p>
      ) : (
        <div className="space-y-2">
          {reservations.map((res) => (
            <ReservationCard
              key={res.id}
              reservation={res}
              onEdit={() => setEditTarget(res)}
              onDelete={() => onDelete(res.id)}
            />
          ))}
        </div>
      )}

      <ReservationEditor
        open={addOpen}
        onOpenChange={setAddOpen}
        days={days}
        initial={null}
        onSave={(f) => onAdd(formToInput(f))}
      />
      {editTarget && (
        <ReservationEditor
          open={editTarget !== null}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          days={days}
          initial={editTarget}
          onSave={(f) => {
            onEdit(editTarget.id, formToInput(f));
            setEditTarget(null);
          }}
        />
      )}
    </section>
  );
}
