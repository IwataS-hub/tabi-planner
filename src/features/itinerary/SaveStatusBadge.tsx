import { Check, CloudOff, Loader2 } from 'lucide-react';
import { useSaveStatus, type SaveState } from '@/hooks/useSaveStatus';
import { cn } from '@/lib/utils';

const LABELS: Record<SaveState, string> = {
  idle: '自動保存',
  saving: '保存中…',
  saved: '保存しました',
  error: '保存に失敗',
};

/**
 * Always-visible textual save indicator (never relies on a toast alone).
 * The live region announces transitions for screen-reader users.
 */
export function SaveStatusBadge() {
  const { state } = useSaveStatus();
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        state === 'error'
          ? 'bg-destructive/10 text-destructive'
          : state === 'saved'
            ? 'bg-emerald-500/12 text-emerald-700'
            : 'bg-secondary text-ink-soft',
      )}
    >
      {state === 'saving' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
      {state === 'saved' ? <Check className="size-3.5" aria-hidden /> : null}
      {state === 'error' ? <CloudOff className="size-3.5" aria-hidden /> : null}
      {LABELS[state]}
    </span>
  );
}
