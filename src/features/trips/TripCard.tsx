import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Copy, Download, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { TripListItem } from '@/repositories/tripRepository';
import { dayCount, formatJaDateRange, formatUpdatedAt } from '@/lib/date';

interface TripCardProps {
  item: TripListItem;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}

export function TripCard({ item, onDuplicate, onDelete, onExport }: TripCardProps) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { trip, placeCount } = item;
  const days = dayCount(trip.startDate, trip.endDate);

  const open = () => navigate(`/trips/${trip.id}`);

  return (
    <Card className="group relative flex flex-col transition-shadow hover:shadow-md">
      {/* Whole-card click target for opening the itinerary (keyboard accessible). */}
      <button
        type="button"
        onClick={open}
        className="focus-visible:ring-ring flex flex-1 flex-col gap-3 rounded-lg p-4 text-left focus-visible:ring-2 focus-visible:outline-none"
        aria-label={`${trip.title} を開く`}
      >
        <div className="flex flex-col gap-1 pr-8">
          <h3 className="font-display text-foreground text-lg leading-snug font-bold">
            {trip.title}
          </h3>
          {trip.description ? (
            <p className="text-muted-foreground line-clamp-2 text-sm">{trip.description}</p>
          ) : null}
        </div>

        <dl className="text-ink-soft mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
          <div className="flex items-center gap-1.5">
            <CalendarDays className="text-ink-faint size-4" aria-hidden />
            <dt className="sr-only">日程</dt>
            <dd>{formatJaDateRange(trip.startDate, trip.endDate)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">日数</dt>
            <dd>{days}日間</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="text-ink-faint size-4" aria-hidden />
            <dt className="sr-only">スポット数</dt>
            <dd>{placeCount}スポット</dd>
          </div>
        </dl>
        <p className="text-ink-faint text-xs">最終更新: {formatUpdatedAt(trip.updatedAt)}</p>
      </button>

      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${trip.title} の操作`}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => navigate(`/trips/${trip.id}/edit`)}>
              <Pencil aria-hidden />
              編集
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDuplicate(trip.id)}>
              <Copy aria-hidden />
              複製
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onExport(trip.id)}>
              <Download aria-hidden />
              JSONで書き出し
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
              <Trash2 aria-hidden />
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="この旅行を削除しますか？"
        description={`「${trip.title}」とそのスポットがすべて削除されます。この操作は取り消せません。`}
        confirmLabel="削除する"
        destructive
        onConfirm={() => onDelete(trip.id)}
      />
    </Card>
  );
}
