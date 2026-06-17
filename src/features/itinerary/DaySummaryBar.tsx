import { Clock, MapPin, Navigation, Wallet } from 'lucide-react';
import type { DaySummary } from '@/domain/summary';
import { formatDuration, formatYen } from '@/lib/date';

/**
 * Compact, single-line totals for the selected day. Kept deliberately small so
 * it informs without competing with the itinerary itself.
 */
export function DaySummaryBar({ summary }: { summary: DaySummary }) {
  const items = [
    { icon: MapPin, label: 'スポット', value: `${summary.placeCount}件` },
    { icon: Clock, label: '滞在', value: formatDuration(summary.totalStayMinutes) },
    { icon: Navigation, label: '移動', value: formatDuration(summary.totalTravelMinutes) },
    { icon: Wallet, label: '予算', value: formatYen(summary.totalCost) },
  ];

  return (
    <dl
      aria-label="この日の合計"
      className="text-ink-soft flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
    >
      {items.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon className="text-ink-faint size-3.5" aria-hidden />
          <dt className="text-ink-faint">{label}</dt>
          <dd className="text-foreground font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
