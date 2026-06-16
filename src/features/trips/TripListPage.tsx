import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { ErrorView, LoadingView } from '@/components/StateViews';
import { APP } from '@/config/app';
import { useTripSummaries } from '@/hooks/useTripData';
import { tripRepository } from '@/repositories/tripRepository';
import { EmptyTrips } from './EmptyTrips';
import { TripCard } from './TripCard';

export function TripListPage() {
  const { status, data, error } = useTripSummaries();

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await tripRepository.duplicate(id);
      toast.success(`「${copy.title}」を作成しました`);
    } catch (err) {
      console.error('複製に失敗しました', err);
      toast.error('複製に失敗しました');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tripRepository.remove(id);
      toast.success('旅行を削除しました');
    } catch (err) {
      console.error('削除に失敗しました', err);
      toast.error('削除に失敗しました');
    }
  };

  return (
    <div className="min-h-dvh">
      <AppHeader>
        <Button asChild size="sm">
          <Link to="/trips/new">
            <Plus aria-hidden />
            新しい旅行
          </Link>
        </Button>
      </AppHeader>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="mb-8 max-w-2xl">
          <h1 className="font-display text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
            {APP.tagline}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{APP.description}</p>
        </section>

        {status === 'loading' ? <LoadingView label="旅行を読み込み中…" /> : null}

        {status === 'error' ? (
          <ErrorView title="旅行の読み込みに失敗しました" error={error} />
        ) : null}

        {status === 'ready' ? (
          data.length === 0 ? (
            <EmptyTrips />
          ) : (
            <>
              <h2 className="text-ink-soft mb-3 text-sm font-medium">
                保存済みの旅行（{data.length}）
              </h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.map((item) => (
                  <li key={item.trip.id}>
                    <TripCard item={item} onDuplicate={handleDuplicate} onDelete={handleDelete} />
                  </li>
                ))}
              </ul>
            </>
          )
        ) : null}
      </main>
    </div>
  );
}
