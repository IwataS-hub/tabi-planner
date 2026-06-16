import { Link } from 'react-router-dom';
import { Compass, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Considered empty state shown before the first trip exists. */
export function EmptyTrips() {
  return (
    <div className="border-line-strong bg-card/60 mx-auto flex max-w-md flex-col items-center gap-5 rounded-2xl border border-dashed px-6 py-14 text-center">
      <span className="bg-accent text-accent-foreground flex size-16 items-center justify-center rounded-full">
        <Compass className="size-8" aria-hidden />
      </span>
      <div className="space-y-1.5">
        <h2 className="font-display text-foreground text-xl font-bold">最初の旅をはじめましょう</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          行き先と日程を決めたら、地図にスポットを置いていくだけ。
          <br />
          下書きはこの端末に自動で保存されます。
        </p>
      </div>
      <Button asChild size="lg">
        <Link to="/trips/new">
          <Plus aria-hidden />
          新しい旅行を作成
        </Link>
      </Button>
    </div>
  );
}
