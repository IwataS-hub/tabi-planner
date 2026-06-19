import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { TripDay } from '@/domain/types';
import { formatJaDateShort } from '@/lib/date';

interface MoveToDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: TripDay[];
  /** If set, the source day is excluded from the options. */
  currentDayId?: string | null;
  onSelect: (dayId: string) => void;
}

export function MoveToDayDialog({
  open,
  onOpenChange,
  days,
  currentDayId,
  onSelect,
}: MoveToDayDialogProps) {
  const options = days.filter((d) => d.id !== currentDayId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>移動先の日を選択</DialogTitle>
        </DialogHeader>
        {options.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">移動先がありません。</p>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {options.map((day, index) => (
              <Button
                key={day.id}
                variant="outline"
                className="justify-start"
                onClick={() => {
                  onSelect(day.id);
                  onOpenChange(false);
                }}
              >
                Day {index + 1}
                <span className="text-muted-foreground ml-2 text-xs">
                  {formatJaDateShort(day.date)}
                </span>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
