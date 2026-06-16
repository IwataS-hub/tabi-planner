import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { getCategoryMeta } from '@/domain/categories';
import type { Place } from '@/domain/types';
import { formatDuration, formatYen } from '@/lib/date';
import { cn } from '@/lib/utils';
import type { PlacePatch } from '@/repositories/placeRepository';
import { PlaceEditor } from './PlaceEditor';

interface PlaceListItemProps {
  place: Place;
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onSave: (id: string, patch: PlacePatch) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onFocusOnMap: (id: string) => void;
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
            </span>
          </span>
        </button>
      </div>

      {selected ? (
        <div id={panelId} className="px-3 pb-3">
          <PlaceEditor
            place={place}
            onSave={onSave}
            onDuplicate={() => onDuplicate(place.id)}
            onDelete={() => onDelete(place.id)}
            onFocusOnMap={() => onFocusOnMap(place.id)}
          />
        </div>
      ) : null}
    </li>
  );
}
