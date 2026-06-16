import { Link } from 'react-router-dom';
import { Map } from 'lucide-react';
import { APP } from '@/config/app';

/** Top app bar with the (easily renamed) product wordmark. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="border-border bg-paper/85 supports-[backdrop-filter]:bg-paper/70 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md"
          aria-label={`${APP.name} ホーム`}
        >
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
            <Map className="size-5" aria-hidden />
          </span>
          <span className="font-display text-foreground text-lg font-bold tracking-tight">
            {APP.name}
          </span>
        </Link>
        {children}
      </div>
    </header>
  );
}
