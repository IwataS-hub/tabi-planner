import { Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Trip } from '@/domain/types';
import { dayCount, formatJaDateRange } from '@/lib/date';
import { SaveStatusBadge } from './SaveStatusBadge';

export function ItineraryHeader({ trip }: { trip: Trip }) {
  return (
    <header className="border-border bg-paper/90 sticky top-0 z-20 shrink-0 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" aria-label="旅行一覧へ戻る">
          <Link to="/">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-foreground truncate text-base leading-tight font-bold">
            {trip.title}
          </h1>
          <p className="text-ink-soft truncate text-xs">
            {formatJaDateRange(trip.startDate, trip.endDate)}・
            {dayCount(trip.startDate, trip.endDate)}日間
          </p>
        </div>

        <SaveStatusBadge />

        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link to={`/trips/${trip.id}/edit`}>
            <Pencil aria-hidden />
            旅行を編集
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="icon-sm"
          className="sm:hidden"
          aria-label="旅行を編集"
        >
          <Link to={`/trips/${trip.id}/edit`}>
            <Pencil aria-hidden />
          </Link>
        </Button>
      </div>
    </header>
  );
}
