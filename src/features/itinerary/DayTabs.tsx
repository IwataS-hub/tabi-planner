import type { TripDay } from '@/domain/types';
import { formatJaDateShort } from '@/lib/date';
import { cn } from '@/lib/utils';

interface DayTabsProps {
  days: TripDay[];
  selectedDayId: string | null;
  placeCountByDay: Record<string, number>;
  onSelect: (dayId: string) => void;
}

/**
 * Horizontal day switcher. Days are derived from the trip range, so this is
 * display-only — there is no manual add/remove (edit the trip dates instead).
 */
export function DayTabs({ days, selectedDayId, placeCountByDay, onSelect }: DayTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="日程"
      className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {days.map((day, index) => {
        const active = day.id === selectedDayId;
        const count = placeCountByDay[day.id] ?? 0;
        return (
          <button
            key={day.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onSelect(day.id)}
            className={cn(
              'flex shrink-0 flex-col items-start rounded-lg border px-3 py-1.5 text-left transition-colors',
              'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
              active
                ? 'border-primary bg-accent text-accent-foreground'
                : 'border-border bg-card text-ink-soft hover:bg-secondary/60',
            )}
          >
            <span className="text-sm leading-tight font-semibold">Day {index + 1}</span>
            <span className="text-[11px] leading-tight opacity-80">
              {formatJaDateShort(day.date)}・{count}件
            </span>
          </button>
        );
      })}
    </div>
  );
}
