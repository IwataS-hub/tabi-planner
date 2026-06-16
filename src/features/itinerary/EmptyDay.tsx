import { MapPinPlus } from 'lucide-react';

/** Empty state for a day with no spots yet. */
export function EmptyDay() {
  return (
    <div className="border-line-strong bg-card/50 flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
      <span className="bg-accent text-accent-foreground flex size-12 items-center justify-center rounded-full">
        <MapPinPlus className="size-6" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="text-foreground font-medium">この日のスポットはまだありません</p>
        <p className="text-muted-foreground text-sm">
          右の地図をクリックすると、この日にスポットを追加できます。
        </p>
      </div>
    </div>
  );
}
