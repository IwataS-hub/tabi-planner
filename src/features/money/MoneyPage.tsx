import { useState, useId } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Trash2, Pencil, Users, Receipt, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { ItineraryHeader } from '@/features/itinerary/ItineraryHeader';
import { TripNav } from '@/features/itinerary/TripNav';
import {
  computeBalances,
  computeSettlement,
  computeBudgetSummary,
  summarizeByCategory,
} from '@/domain/settlement';
import type { ExpenseCategory, Participant } from '@/domain/types';
import { EXPENSE_CATEGORIES } from '@/domain/types';
import { formatYen } from '@/lib/date';
import { useSaveStatus } from '@/hooks/useSaveStatus';
import { useTrip, useTripDays, useTripParticipants, useTripExpenses } from '@/hooks/useTripData';
import { participantRepository } from '@/repositories/participantRepository';
import {
  expenseRepository,
  equalSplit,
  type ExpenseDraft,
  type ShareInput,
} from '@/repositories/expenseRepository';
import { tripRepository } from '@/repositories/tripRepository';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: '食事',
  transport: '交通',
  lodging: '宿泊',
  sightseeing: '観光',
  shopping: '買い物',
  activity: 'アクティビティ',
  other: 'その他',
};

function formatYenSigned(amount: number): string {
  if (amount > 0) return `+${formatYen(amount)}`;
  if (amount < 0) return `-${formatYen(-amount)}`;
  return '±0円';
}

export function MoneyPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { track } = useSaveStatus();

  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const participants = useTripParticipants(tripId);
  const expenses = useTripExpenses(tripId);

  const [addingParticipant, setAddingParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [editingParticipantName, setEditingParticipantName] = useState('');
  const [addingExpense, setAddingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);

  if (trip.status === 'loading' || participants.status === 'loading') {
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
  const expenseList = expenses.data ?? [];
  const allExpenses = expenseList.map((ew) => ew.expense);
  const allShares = expenseList.flatMap((ew) => ew.shares);

  const balances = computeBalances(participantList, allExpenses, allShares);
  const settlement = computeSettlement(balances);
  const budgetSummary = computeBudgetSummary(tripData.budgetYen, allExpenses);
  const categorySummaries = summarizeByCategory(allExpenses);

  const handleAddParticipant = async () => {
    if (!tripId || !newParticipantName.trim()) return;
    await track(() => participantRepository.add({ tripId, name: newParticipantName.trim() }));
    setNewParticipantName('');
    setAddingParticipant(false);
  };

  const handleRemoveParticipant = async (id: string) => {
    try {
      await participantRepository.remove(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除できませんでした');
    }
  };

  const handleRenameParticipant = async (id: string) => {
    const name = editingParticipantName.trim();
    if (!name) return;
    await track(() => participantRepository.update(id, name));
    setEditingParticipantId(null);
    setEditingParticipantName('');
  };

  const handleSaveBudget = async () => {
    if (!tripId) return;
    const trimmed = budgetInput.trim();
    const budgetYen = trimmed === '' ? null : parseInt(trimmed, 10);
    if (trimmed !== '' && (Number.isNaN(budgetYen) || budgetYen === null || budgetYen < 0)) return;
    await track(() =>
      tripRepository.updateDetails(tripData.id, {
        title: tripData.title,
        description: tripData.description,
        startDate: tripData.startDate,
        endDate: tripData.endDate,
        budgetYen,
      }),
    );
    setEditingBudget(false);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <ItineraryHeader trip={tripData} />
      <TripNav tripId={tripData.id} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-4">
          {/* Budget */}
          <section>
            <h2 className="text-foreground mb-2 text-sm font-semibold">予算</h2>
            <div className="bg-card rounded-xl border p-4">
              {editingBudget ? (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    placeholder="予算（円）"
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSaveBudget();
                    }}
                  />
                  <Button size="sm" onClick={() => void handleSaveBudget()}>
                    保存
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingBudget(false)}>
                    キャンセル
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-ink-soft text-xs">予算</p>
                    <p className="text-foreground text-lg font-bold">
                      {tripData.budgetYen != null ? formatYen(tripData.budgetYen) : '未設定'}
                    </p>
                    {tripData.budgetYen != null && (
                      <p
                        className={`text-xs ${budgetSummary.overBudget ? 'text-red-600' : 'text-green-600'}`}
                      >
                        支出 {formatYen(budgetSummary.spentYen)} / 残り{' '}
                        {budgetSummary.remainingYen != null
                          ? budgetSummary.overBudget
                            ? `${formatYen(-budgetSummary.remainingYen)} オーバー`
                            : formatYen(budgetSummary.remainingYen)
                          : '—'}
                      </p>
                    )}
                    {tripData.budgetYen == null && allExpenses.length > 0 && (
                      <p className="text-ink-soft text-xs">
                        合計支出 {formatYen(budgetSummary.spentYen)}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setBudgetInput(tripData.budgetYen?.toString() ?? '');
                      setEditingBudget(true);
                    }}
                  >
                    <Pencil className="mr-1 size-3.5" aria-hidden />
                    {tripData.budgetYen != null ? '変更' : '設定'}
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Participants */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-foreground text-sm font-semibold">
                <Users className="mr-1 inline size-4" aria-hidden />
                参加者 ({participantList.length}人)
              </h2>
              <Button size="sm" variant="outline" onClick={() => setAddingParticipant(true)}>
                <Plus className="mr-1 size-3.5" aria-hidden />
                追加
              </Button>
            </div>

            {addingParticipant && (
              <div className="bg-card mb-2 flex gap-2 rounded-xl border p-3">
                <Input
                  autoFocus
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  placeholder="参加者名"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleAddParticipant();
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => void handleAddParticipant()}
                  disabled={!newParticipantName.trim()}
                >
                  追加
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAddingParticipant(false);
                    setNewParticipantName('');
                  }}
                >
                  キャンセル
                </Button>
              </div>
            )}

            {participantList.length === 0 ? (
              <p className="text-ink-soft text-sm">参加者を追加してください。</p>
            ) : (
              <ul className="space-y-1.5">
                {participantList.map((p) => {
                  const bal = balances.find((b) => b.participantId === p.id);
                  if (editingParticipantId === p.id) {
                    return (
                      <li
                        key={p.id}
                        className="bg-card flex items-center gap-2 rounded-xl border px-3 py-2"
                      >
                        <Input
                          autoFocus
                          value={editingParticipantName}
                          onChange={(e) => setEditingParticipantName(e.target.value)}
                          className="h-7 flex-1 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleRenameParticipant(p.id);
                            if (e.key === 'Escape') {
                              setEditingParticipantId(null);
                              setEditingParticipantName('');
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => void handleRenameParticipant(p.id)}
                          disabled={!editingParticipantName.trim()}
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingParticipantId(null);
                            setEditingParticipantName('');
                          }}
                        >
                          キャンセル
                        </Button>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={p.id}
                      className="bg-card flex items-center justify-between rounded-xl border px-3 py-2"
                    >
                      <div>
                        <span className="text-foreground text-sm font-medium">{p.name}</span>
                        {bal && (
                          <span
                            className={`ml-2 text-xs ${bal.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {formatYenSigned(bal.balance)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${p.name}を編集`}
                          onClick={() => {
                            setEditingParticipantId(p.id);
                            setEditingParticipantName(p.name);
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`${p.name}を削除`}
                          onClick={() => void handleRemoveParticipant(p.id)}
                        >
                          <Trash2 className="text-destructive size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Expenses */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-foreground text-sm font-semibold">
                <Receipt className="mr-1 inline size-4" aria-hidden />
                費用一覧 ({allExpenses.length}件)
              </h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddingExpense(true)}
                disabled={participantList.length === 0}
              >
                <Plus className="mr-1 size-3.5" aria-hidden />
                追加
              </Button>
            </div>

            {participantList.length === 0 && (
              <p className="text-ink-soft text-sm">費用を追加する前に参加者を登録してください。</p>
            )}

            {addingExpense && participantList.length > 0 && (
              <ExpenseForm
                participants={participantList}
                tripId={tripId!}
                days={days.data ?? []}
                onSave={async (draft) => {
                  await track(() => expenseRepository.add(draft));
                  setAddingExpense(false);
                }}
                onCancel={() => setAddingExpense(false)}
              />
            )}

            {expenseList.length === 0 ? (
              <p className="text-ink-soft text-sm">費用がありません。</p>
            ) : (
              <ul className="space-y-2">
                {expenseList.map(({ expense, shares }) => {
                  const payer = participantList.find((p) => p.id === expense.payerId);
                  return (
                    <li key={expense.id} className="bg-card rounded-xl border p-3">
                      {editingExpenseId === expense.id ? (
                        <ExpenseForm
                          participants={participantList}
                          tripId={tripId!}
                          days={days.data ?? []}
                          initial={{
                            expense,
                            shares: shares.map((s) => ({
                              participantId: s.participantId,
                              amountYen: s.amountYen,
                            })),
                          }}
                          onSave={async (draft) => {
                            await track(() =>
                              expenseRepository.update(expense.id, {
                                ...draft,
                                dayId: draft.dayId ?? null,
                                placeId: draft.placeId ?? null,
                              }),
                            );
                            setEditingExpenseId(null);
                          }}
                          onCancel={() => setEditingExpenseId(null)}
                        />
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground font-medium">{expense.title}</p>
                            <p className="text-ink-soft text-xs">
                              {CATEGORY_LABELS[expense.category]} · {payer?.name ?? '?'}が支払い ·{' '}
                              {formatYen(expense.amountYen)}
                            </p>
                            {expense.memo && (
                              <p className="text-ink-soft mt-0.5 text-xs">{expense.memo}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="編集"
                              onClick={() => setEditingExpenseId(expense.id)}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="削除"
                              onClick={() => setDeleteExpenseId(expense.id)}
                            >
                              <Trash2 className="text-destructive size-3.5" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Category summary */}
          {categorySummaries.length > 0 && (
            <section>
              <h2 className="text-foreground mb-2 text-sm font-semibold">カテゴリ別</h2>
              <div className="bg-card rounded-xl border p-3">
                <dl className="space-y-1">
                  {categorySummaries.map(({ category, totalYen }) => (
                    <div key={category} className="flex justify-between text-sm">
                      <dt className="text-ink-soft">
                        {CATEGORY_LABELS[category as ExpenseCategory] ?? category}
                      </dt>
                      <dd className="text-foreground font-medium">{formatYen(totalYen)}</dd>
                    </div>
                  ))}
                  <div className="border-border mt-1 flex justify-between border-t pt-1 text-sm font-bold">
                    <span>合計</span>
                    <span>{formatYen(budgetSummary.spentYen)}</span>
                  </div>
                </dl>
              </div>
            </section>
          )}

          {/* Settlement */}
          {settlement.length > 0 && (
            <section>
              <h2 className="text-foreground mb-2 text-sm font-semibold">精算提案</h2>
              <ul className="space-y-2">
                {settlement.map((transfer, index) => (
                  <li
                    key={index}
                    className="bg-card flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                  >
                    <span className="text-foreground font-medium">{transfer.fromName}</span>
                    <ArrowRight className="text-ink-soft size-3.5 shrink-0" aria-hidden />
                    <span className="text-foreground font-medium">{transfer.toName}</span>
                    <span className="ml-auto font-bold text-red-600">
                      {formatYen(transfer.amountYen)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteExpenseId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteExpenseId(null);
        }}
        title="費用を削除しますか？"
        description="この費用と分担データが削除されます。"
        confirmLabel="削除"
        destructive
        onConfirm={() => {
          if (deleteExpenseId) void track(() => expenseRepository.remove(deleteExpenseId));
          setDeleteExpenseId(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline expense form
// ---------------------------------------------------------------------------

interface ExpenseFormProps {
  participants: Participant[];
  tripId: string;
  days: { id: string; date: string }[];
  initial?: {
    expense: {
      title: string;
      amountYen: number;
      category: ExpenseCategory;
      payerId: string;
      dayId: string | null;
      placeId: string | null;
      occurredAt: string | null;
      memo: string;
    };
    shares: ShareInput[];
  };
  onSave: (draft: ExpenseDraft) => Promise<void>;
  onCancel: () => void;
}

function ExpenseForm({ participants, tripId, days, initial, onSave, onCancel }: ExpenseFormProps) {
  const fieldId = useId();
  const [title, setTitle] = useState(initial?.expense.title ?? '');
  const [amountStr, setAmountStr] = useState(initial?.expense.amountYen.toString() ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(initial?.expense.category ?? 'other');
  const [payerId, setPayerId] = useState(initial?.expense.payerId ?? participants[0]?.id ?? '');
  const [dayId, setDayId] = useState<string>(initial?.expense.dayId ?? '');
  const [memo, setMemo] = useState(initial?.expense.memo ?? '');
  const [splitMode, setSplitMode] = useState<'equal' | 'selected' | 'custom'>('equal');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(participants.map((p) => p.id)),
  );
  const [customShares, setCustomShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial?.shares.map((s) => [s.participantId, s.amountYen.toString()]) ??
        participants.map((p) => [p.id, '0']),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amount = parseInt(amountStr, 10);
  const amountValid = !Number.isNaN(amount) && amount >= 0;

  const selectedParticipants =
    splitMode === 'selected' ? participants.filter((p) => selectedIds.has(p.id)) : participants;

  const computedShares: ShareInput[] =
    splitMode === 'equal'
      ? equalSplit(amountValid ? amount : 0, participants)
      : splitMode === 'selected'
        ? equalSplit(amountValid ? amount : 0, selectedParticipants)
        : participants.map((p) => ({
            participantId: p.id,
            amountYen: parseInt(customShares[p.id] ?? '0', 10) || 0,
          }));

  const shareTotal = computedShares.reduce((s, x) => s + x.amountYen, 0);

  const handleSubmit = async () => {
    if (!title.trim() || !amountValid || !payerId) {
      setError('名称・金額・支払者を入力してください');
      return;
    }
    if (splitMode === 'custom' && shareTotal !== amount) {
      setError(
        `分担合計（${formatYen(shareTotal)}）が費用額（${formatYen(amount)}）と一致しません`,
      );
      return;
    }
    setSaving(true);
    try {
      await onSave({
        tripId,
        dayId: dayId || null,
        placeId: null,
        title: title.trim(),
        amountYen: amount,
        category,
        payerId,
        occurredAt: null,
        memo: memo.trim(),
        shares: computedShares,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-secondary/30 mb-3 space-y-3 rounded-xl border p-3">
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-title`}>名称</Label>
        <Input
          id={`${fieldId}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例：夕食"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-amount`}>金額（円）</Label>
          <Input
            id={`${fieldId}-amount`}
            type="number"
            inputMode="numeric"
            min={0}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-category`}>カテゴリ</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
            <SelectTrigger id={`${fieldId}-category`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-payer`}>支払者</Label>
        <Select value={payerId} onValueChange={setPayerId}>
          <SelectTrigger id={`${fieldId}-payer`}>
            <SelectValue placeholder="選択してください" />
          </SelectTrigger>
          <SelectContent>
            {participants.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {days.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-day`}>日付（任意）</Label>
          <Select value={dayId} onValueChange={setDayId}>
            <SelectTrigger id={`${fieldId}-day`}>
              <SelectValue placeholder="指定なし" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">指定なし</SelectItem>
              {days.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {/* Split mode */}
      <div className="space-y-1">
        <Label>分担方法</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSplitMode('equal')}
            className={`rounded px-2 py-1 text-xs ${splitMode === 'equal' ? 'bg-primary text-primary-foreground' : 'text-ink-soft border'}`}
          >
            均等割り
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('selected')}
            className={`rounded px-2 py-1 text-xs ${splitMode === 'selected' ? 'bg-primary text-primary-foreground' : 'text-ink-soft border'}`}
          >
            一部均等
          </button>
          <button
            type="button"
            onClick={() => setSplitMode('custom')}
            className={`rounded px-2 py-1 text-xs ${splitMode === 'custom' ? 'bg-primary text-primary-foreground' : 'text-ink-soft border'}`}
          >
            カスタム
          </button>
        </div>
        {splitMode === 'selected' && (
          <div className="mt-1 flex flex-wrap gap-2">
            {participants.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onChange={(e) =>
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
        <div className="mt-1 space-y-1">
          {participants.map((p) => {
            const share = computedShares.find((s) => s.participantId === p.id);
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="text-ink-soft min-w-16 text-xs">{p.name}</span>
                {splitMode === 'custom' ? (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={customShares[p.id] ?? '0'}
                    onChange={(e) =>
                      setCustomShares((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    className="h-7 w-24 text-xs"
                  />
                ) : (
                  <span className="text-foreground text-xs">
                    {formatYen(share?.amountYen ?? 0)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fieldId}-memo`}>メモ（任意）</Label>
        <Input
          id={`${fieldId}-memo`}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="メモ"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void handleSubmit()} disabled={saving}>
          保存
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
