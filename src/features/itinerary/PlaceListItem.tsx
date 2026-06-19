import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Check, X, Calendar } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { getCategoryMeta } from '@/domain/categories';
import type { Place, TripDay, VisitStatus } from '@/domain/types';
import { formatDuration, formatYen } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { PlacePatch } from '@/repositories/placeRepository';
import { PlaceEditor } from './PlaceEditor';
import type { TimelineEntry } from '@/domain/timeline';

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  planned: '予定',
  visited: '訪問済',
  skipped: 'スキップ',
};

function nextStatus(status: VisitStatus): VisitStatus {
  if (status === 'planned') return 'visited';
  if (status === 'visited') return 'skipped';
  return 'planned';
}

function VisitStatusBadge({ status, onClick }: { status: VisitStatus; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`訪問状態: ${VISIT_STATUS_LABELS[status]}。クリックで変更`}
      className={cn(
        'flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
        status === 'visited' && 'bg-green-100 text-green-700',
        status === 'skipped' && 'bg-neutral-100 text-neutral-500 line-through',
        status === 'planned' && 'bg-blue-50 text-blue-600',
      )}
    >
      {status === 'visited' && <Check className="size-3" aria-hidden />}
      {status === 'skipped' && <X className="size-3" aria-hidden />}
      {status === 'planned' && <Calendar className="size-3" aria-hidden />}
      {VISIT_STATUS_LABELS[status]}
    </button>
  );
}

interface PlaceListItemProps {
  place: Place;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onSave: (id: string, patch: PlacePatch) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onFocusOnMap: (id: string) => void;
  onVisitStatusChange?: (id: string, status: VisitStatus) => void;
  days?: TripDay[];
  onMoveToDay?: (id: string, targetDayId: string) => void;
  onMoveToCandidate?: (id: string) => void;
  /** Timeline entry for this place (derived, not persisted). */
  timelineEntry?: TimelineEntry | null;
}

function summary(place: Place): string {
  const parts: string[] = [];
  if (place.startTime) parts.push(place.startTime);
  if (place.stayMinutes != null) parts.push(`滞在${formatDuration(place.stayMinutes)}`);
  if (place.estimatedCost != null) parts.push(formatYen(place.estimatedCost));
  return parts.join('・');
}

export function PlaceListItem({
  place,
  index,
  selected,
  onSelect,
  onSave,
  onDuplicate,
  onDelete,
  onFocusOnMap,
  onVisitStatusChange,
  days,
  onMoveToDay,
  onMoveToCandidate,
  timelineEntry,
}: PlaceListItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: place.id,
  });
  const meta = getCategoryMeta(place.category);
  const meta_line = summary(place);
  const panelId = `place-panel-${place.id}`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-card rounded-xl border shadow-sm transition-colors',
        selected ? 'border-primary ring-primary/40 ring-1' : 'border-border',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      <div className="flex items-stretch gap-1 p-2">
        <button
          type="button"
          className="text-ink-faint hover:bg-secondary/70 focus-visible:ring-ring flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none active:cursor-grabbing"
          aria-label={`${place.name} を並べ替え`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => onSelect(place.id)}
          aria-expanded={selected}
          aria-controls={panelId}
          className="focus-visible:ring-ring flex flex-1 items-center gap-3 rounded-md px-1 py-1.5 text-left focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="relative flex size-8 shrink-0 items-center justify-center">
            <span
              className="flex size-8 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: meta.color }}
            >
              <CategoryIcon category={place.category} className="size-4" />
            </span>
            <span className="border-card bg-paper text-ink absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border text-[10px] font-bold">
              {index + 1}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-foreground block truncate font-medium">{place.name}</span>
            <span className="text-ink-soft block truncate text-xs">
              {meta.label}
              {meta_line ? `・${meta_line}` : ''}
              {timelineEntry?.arrivalTime && (
                <>
                  {' '}
                  <span className={timelineEntry.isEstimated ? 'text-ink-faint italic' : ''}>
                    着{timelineEntry.arrivalTime}
                    {timelineEntry.isEstimated ? '（推定）' : ''}
                  </span>
                </>
              )}
            </span>
          </span>
        </button>

        {onVisitStatusChange ? (
          <VisitStatusBadge
            status={place.visitStatus}
            onClick={() => onVisitStatusChange(place.id, nextStatus(place.visitStatus))}
          />
        ) : null}
      </div>

      {selected ? (
        <div id={panelId} className="px-3 pb-3">
          <PlaceEditor
            place={place}
            onSave={onSave}
            onDuplicate={() => onDuplicate(place.id)}
            onDelete={() => onDelete(place.id)}
            onFocusOnMap={() => onFocusOnMap(place.id)}
            days={days}
            onMoveToDay={onMoveToDay}
            onMoveToCandidate={onMoveToCandidate}
          />
        </div>
      ) : null}
    </li>
  );
}
