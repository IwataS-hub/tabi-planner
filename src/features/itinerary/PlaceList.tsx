import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Place } from '@/domain/types';
import type { PlacePatch } from '@/repositories/placeRepository';
import { EmptyDay } from './EmptyDay';
import { PlaceListItem } from './PlaceListItem';

interface PlaceListProps {
  places: Place[];
  selectedPlaceId: string | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onSave: (id: string, patch: PlacePatch) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onFocusOnMap: (id: string) => void;
}

export function PlaceList({
  places,
  selectedPlaceId,
  onSelect,
  onReorder,
  onSave,
  onDuplicate,
  onDelete,
  onFocusOnMap,
}: PlaceListProps) {
  // A drag-time order override (set only in the drag handler, never in an
  // effect). The render order is derived by reconciling this override with the
  // persisted list, so adds/removes/day-switches need no synchronisation effect.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);

  const placeIds = places.map((place) => place.id);
  let displayIds = placeIds;
  if (dragOrder) {
    const known = new Set(placeIds);
    const kept = dragOrder.filter((id) => known.has(id));
    const added = placeIds.filter((id) => !kept.includes(id));
    displayIds = [...kept, ...added];
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (places.length === 0) {
    return <EmptyDay />;
  }

  const byId = new Map(places.map((place) => [place.id, place]));
  const ordered = displayIds
    .map((id) => byId.get(id))
    .filter((place): place is Place => place !== undefined);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayIds.indexOf(String(active.id));
    const newIndex = displayIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(displayIds, oldIndex, newIndex);
    setDragOrder(next);
    onReorder(next);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={displayIds} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {ordered.map((place, index) => (
            <PlaceListItem
              key={place.id}
              place={place}
              index={index}
              selected={place.id === selectedPlaceId}
              onSelect={onSelect}
              onSave={onSave}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onFocusOnMap={onFocusOnMap}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
