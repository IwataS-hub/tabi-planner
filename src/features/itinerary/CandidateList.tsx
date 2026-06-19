import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MapPin, Trash2, CalendarArrowUp } from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { getCategoryMeta } from '@/domain/categories';
import type { CandidatePlace, TripDay } from '@/domain/types';
import { cn } from '@/lib/utils';
import { MoveToDayDialog } from './MoveToDayDialog';

interface CandidateItemProps {
  candidate: CandidatePlace;
  days: TripDay[];
  onPromote: (candidateId: string, dayId: string) => void;
  onRemove: (id: string) => void;
}

function CandidateItem({ candidate, days, onPromote, onRemove }: CandidateItemProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: candidate.id,
  });
  const meta = getCategoryMeta(candidate.category);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <>
      <li
        ref={setNodeRef}
        style={style}
        className={cn(
          'bg-card flex items-center gap-1.5 rounded-lg border px-2 py-2 shadow-sm',
          isDragging && 'z-10 opacity-80 shadow-lg',
        )}
      >
        <button
          type="button"
          className="text-ink-faint hover:bg-secondary/70 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded focus-visible:outline-none"
          aria-label={`${candidate.name} を並べ替え`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-white"
          style={{ backgroundColor: meta.color }}
        >
          <CategoryIcon category={candidate.category} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{candidate.name}</span>
          {candidate.address ? (
            <span className="text-ink-soft flex items-center gap-0.5 truncate text-[11px]">
              <MapPin className="size-2.5 shrink-0" aria-hidden />
              {candidate.address}
            </span>
          ) : (
            <span className="text-ink-faint text-[11px]">{meta.label}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          aria-label={`${candidate.name} を日程へ追加`}
          title="日程へ追加"
          className="text-primary hover:bg-primary/10 rounded p-1 transition-colors"
        >
          <CalendarArrowUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onRemove(candidate.id)}
          aria-label={`${candidate.name} を候補から削除`}
          title="削除"
          className="text-destructive hover:bg-destructive/10 rounded p-1 transition-colors"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </li>
      <MoveToDayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        days={days}
        currentDayId={null}
        onSelect={(dayId) => onPromote(candidate.id, dayId)}
      />
    </>
  );
}

interface CandidateListProps {
  candidates: CandidatePlace[];
  days: TripDay[];
  onPromote: (candidateId: string, dayId: string) => void;
  onRemove: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function CandidateList({
  candidates,
  days,
  onPromote,
  onRemove,
  onReorder,
}: CandidateListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = candidates.findIndex((c) => c.id === active.id);
    const newIndex = candidates.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...candidates];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    onReorder(next.map((c) => c.id));
  }

  if (candidates.length === 0) {
    return <p className="text-ink-faint py-2 text-center text-xs">候補スポットはありません</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={candidates.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-1.5">
          {candidates.map((c) => (
            <CandidateItem
              key={c.id}
              candidate={c}
              days={days}
              onPromote={onPromote}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
