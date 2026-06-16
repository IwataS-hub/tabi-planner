import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Inline loading indicator with an accessible live region. */
export function LoadingView({
  label = '読み込み中…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'text-muted-foreground flex items-center justify-center gap-2 py-16',
        className,
      )}
    >
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/** Error panel. `error` is shown so failures are never silent. */
export function ErrorView({
  title = '問題が発生しました',
  error,
  action,
  className,
}: {
  title?: string;
  error?: Error | string;
  action?: ReactNode;
  className?: string;
}) {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border p-6 text-center',
        className,
      )}
    >
      <AlertTriangle className="text-destructive size-6" aria-hidden />
      <p className="text-foreground font-medium">{title}</p>
      {message ? <p className="text-muted-foreground text-sm">{message}</p> : null}
      {action}
    </div>
  );
}
