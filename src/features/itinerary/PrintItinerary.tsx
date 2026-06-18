import { getCategoryMeta } from '@/domain/categories';
import { formatDistanceMeters, TRAVEL_MODE_LABELS } from '@/domain/routing';
import { summarizeDay } from '@/domain/summary';
import { computeBudgetSummary, computeSettlement, computeBalances, summarizeByCategory } from '@/domain/settlement';
import type { ChecklistItem, Expense, ExpenseShare, Participant, Place, Trip, TripDay, VisitStatus } from '@/domain/types';
import { dayCount, formatDuration, formatJaDate, formatJaDateRange, formatYen } from '@/lib/date';
import { APP } from '@/config/app';

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planned: '予定',
  visited: '訪問済',
  skipped: 'スキップ',
};

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  food: '食事',
  transport: '交通',
  lodging: '宿泊',
  sightseeing: '観光',
  shopping: '買い物',
  activity: 'アクティビティ',
  other: 'その他',
};

/** Print-friendly "next leg" text: mode + time (+ distance for auto). */
function travelText(place: Place): string {
  if (place.travelMinutes == null) return '—';
  const isAuto = place.travelEstimateSource === 'auto';
  const prefix = place.travelMode ? `${TRAVEL_MODE_LABELS[place.travelMode]} ` : '';
  const distance =
    isAuto && place.travelDistanceMeters != null
      ? `・${formatDistanceMeters(place.travelDistanceMeters)}`
      : '';
  const suffix = isAuto ? '' : '（手入力）';
  return `${prefix}${formatDuration(place.travelMinutes)}${distance}${suffix}`;
}

interface PrintItineraryProps {
  trip: Trip;
  days: TripDay[];
  places: Place[];
  participants?: Participant[];
  expenses?: Expense[];
  expenseShares?: ExpenseShare[];
  checklistItems?: ChecklistItem[];
  /** In-memory weather is only printed if already fetched; printing never triggers a fetch. */
  weatherSummary?: string;
}

export function PrintItinerary({
  trip,
  days,
  places,
  participants = [],
  expenses = [],
  expenseShares = [],
  checklistItems = [],
}: PrintItineraryProps) {
  const placesByDay = new Map<string, Place[]>();
  for (const place of places) {
    const list = placesByDay.get(place.dayId) ?? [];
    list.push(place);
    placesByDay.set(place.dayId, list);
  }

  const budgetSummary = computeBudgetSummary(trip.budgetYen, expenses);
  const balances = participants.length > 0 ? computeBalances(participants, expenses, expenseShares) : [];
  const settlement = computeSettlement(balances);
  const categorySummaries = summarizeByCategory(expenses);
  const incompleteItems = checklistItems.filter((item) => !item.completed);

  return (
    <div className="hidden text-black print:block">
      <header className="mb-5 border-b border-black pb-3">
        <p className="text-[10px] tracking-wide text-neutral-600">{APP.name} 旅のしおり</p>
        <h1 className="font-display text-2xl font-bold">{trip.title}</h1>
        {trip.description ? <p className="mt-1 text-sm">{trip.description}</p> : null}
        <p className="mt-1 text-sm text-neutral-700">
          {formatJaDateRange(trip.startDate, trip.endDate)}・全
          {dayCount(trip.startDate, trip.endDate)}日間
        </p>
        {trip.budgetYen != null && (
          <p className="mt-0.5 text-sm text-neutral-700">
            予算: {formatYen(trip.budgetYen)} /
            合計支出: {formatYen(budgetSummary.spentYen)}
            {budgetSummary.overBudget && ` （${formatYen(-budgetSummary.remainingYen!)}超過）`}
          </p>
        )}
      </header>

      {/* Itinerary */}
      {days.map((day, index) => {
        const dayPlaces = placesByDay.get(day.id) ?? [];
        const summary = summarizeDay(dayPlaces);
        const visitedCount = dayPlaces.filter((p) => p.visitStatus === 'visited').length;
        const skippedCount = dayPlaces.filter((p) => p.visitStatus === 'skipped').length;
        return (
          <section key={day.id} className="mb-5 break-inside-avoid">
            <div className="flex items-baseline justify-between border-b border-neutral-400 pb-1">
              <h2 className="text-base font-bold">
                Day {index + 1}
                <span className="ml-2 text-sm font-normal text-neutral-700">
                  {formatJaDate(day.date)}
                </span>
              </h2>
              <p className="text-[11px] text-neutral-700">
                スポット{summary.placeCount}件
                {visitedCount > 0 && `・訪問${visitedCount}件`}
                {skippedCount > 0 && `・スキップ${skippedCount}件`}
                ・滞在{formatDuration(summary.totalStayMinutes)}
                ・移動{formatDuration(summary.totalTravelMinutes)}
                ・予算{formatYen(summary.totalCost)}
              </p>
            </div>

            {dayPlaces.length === 0 ? (
              <p className="py-2 text-sm text-neutral-500">予定はありません。</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {dayPlaces.map((place, placeIndex) => {
                  const meta = getCategoryMeta(place.category);
                  const isLast = placeIndex === dayPlaces.length - 1;
                  return (
                    <li
                      key={place.id}
                      className="break-inside-avoid border border-neutral-300 px-3 py-2"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold tabular-nums">{placeIndex + 1}.</span>
                        <span className="text-neutral-700 tabular-nums">
                          {place.startTime ?? '--:--'}
                        </span>
                        <span className="flex-1 font-semibold">{place.name}</span>
                        <span className="rounded border border-neutral-400 px-1.5 py-0.5 text-[10px]">
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-neutral-600">
                          {VISIT_STATUS_LABELS[place.visitStatus]}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-700">
                        滞在: {place.stayMinutes != null ? formatDuration(place.stayMinutes) : '—'}
                        {!isLast ? <> / 次への移動: {travelText(place)}</> : null} / 予算:{' '}
                        {place.estimatedCost != null ? formatYen(place.estimatedCost) : '—'}
                      </div>
                      {place.memo ? (
                        <p className="mt-1 text-[11px] whitespace-pre-wrap">メモ: {place.memo}</p>
                      ) : null}
                      {place.url ? (
                        <p className="mt-0.5 text-[11px] break-all text-neutral-700">{place.url}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}

      {/* Expense summary */}
      {expenses.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-2 border-b border-neutral-400 pb-1 text-base font-bold">費用サマリー</h2>
          <dl className="space-y-1 text-sm">
            {categorySummaries.map(({ category, totalYen }) => (
              <div key={category} className="flex justify-between">
                <dt className="text-neutral-600">{EXPENSE_CATEGORY_LABELS[category] ?? category}</dt>
                <dd>{formatYen(totalYen)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-neutral-400 pt-1 font-bold">
              <span>合計</span>
              <span>{formatYen(budgetSummary.spentYen)}</span>
            </div>
          </dl>
        </section>
      )}

      {/* Settlement */}
      {settlement.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-2 border-b border-neutral-400 pb-1 text-base font-bold">精算</h2>
          <ul className="space-y-0.5 text-sm">
            {settlement.map((transfer, i) => (
              <li key={i}>
                {transfer.fromName} → {transfer.toName}: {formatYen(transfer.amountYen)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Incomplete checklist items */}
      {incompleteItems.length > 0 && (
        <section className="mb-5 break-inside-avoid">
          <h2 className="mb-2 border-b border-neutral-400 pb-1 text-base font-bold">未完了チェックリスト</h2>
          <ul className="space-y-0.5 text-sm">
            {incompleteItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2">
                <span className="mt-0.5 inline-block size-3.5 shrink-0 rounded border border-neutral-400" />
                <span>
                  [{item.kind === 'packing' ? '持ち物' : 'ToDo'}] {item.title}
                  {item.dueAt ? ` （期日: ${item.dueAt}）` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
