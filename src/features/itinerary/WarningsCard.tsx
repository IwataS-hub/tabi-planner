import { useState } from 'react';
import { AlertTriangle, Info, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { ItineraryWarning, WarningLevel } from '@/domain/itineraryWarnings';
import { cn } from '@/lib/utils';

const LEVEL_CONFIG: Record<
  WarningLevel,
  { icon: typeof AlertTriangle; bg: string; text: string; label: string }
> = {
  warning: {
    icon: AlertTriangle,
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    label: '注意',
  },
  caution: {
    icon: AlertCircle,
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    label: '確認',
  },
  info: { icon: Info, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', label: '情報' },
};

interface WarningsCardProps {
  warnings: ItineraryWarning[];
  /** When provided, only show warnings for this day and trip-wide ones. */
  dayId?: string | null;
  title?: string;
}

export function WarningsCard({ warnings, dayId, title = 'スマート警告' }: WarningsCardProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  const visible = warnings.filter((w) => {
    if (dismissed.has(w.id)) return false;
    if (dayId !== undefined) {
      return w.dayId === dayId || w.dayId === null;
    }
    return true;
  });

  if (visible.length === 0) return null;

  const warningCount = visible.filter((w) => w.level === 'warning').length;
  const cautionCount = visible.filter((w) => w.level === 'caution').length;

  return (
    <div className="overflow-hidden rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-neutral-50"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {warningCount > 0 && <AlertTriangle className="size-4 text-red-600" aria-hidden />}
          {warningCount === 0 && cautionCount > 0 && (
            <AlertCircle className="size-4 text-amber-500" aria-hidden />
          )}
          {warningCount === 0 && cautionCount === 0 && (
            <Info className="size-4 text-blue-500" aria-hidden />
          )}
          {title}
          <span className="text-muted-foreground font-normal">({visible.length}件)</span>
        </span>
        {expanded ? (
          <ChevronUp className="text-muted-foreground size-4 shrink-0" aria-hidden />
        ) : (
          <ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
        )}
      </button>

      {expanded && (
        <ul className="divide-y border-t">
          {visible.map((w) => {
            const cfg = LEVEL_CONFIG[w.level];
            const Icon = cfg.icon;
            return (
              <li key={w.id} className={cn('flex items-start gap-2 px-3 py-2 text-xs', cfg.bg)}>
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', cfg.text)} aria-hidden />
                <span className={cn('flex-1', cfg.text)}>{w.message}</span>
                <button
                  type="button"
                  onClick={() => setDismissed((s) => new Set(s).add(w.id))}
                  aria-label="非表示にする"
                  className={cn('shrink-0 opacity-50 hover:opacity-100', cfg.text)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
