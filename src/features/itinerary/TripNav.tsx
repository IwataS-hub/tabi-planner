import { NavLink } from 'react-router-dom';
import { ListChecks, Wallet, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TripNavProps {
  tripId: string;
}

const tabs = [
  { to: (id: string) => `/trips/${id}`, label: '旅程', icon: ListChecks, exact: true },
  { to: (id: string) => `/trips/${id}/money`, label: 'お金', icon: Wallet, exact: false },
  { to: (id: string) => `/trips/${id}/checklists`, label: 'チェック', icon: CheckSquare, exact: false },
] as const;

export function TripNav({ tripId }: TripNavProps) {
  return (
    <nav aria-label="トリップセクション" className="border-border flex shrink-0 border-b">
      {tabs.map(({ to, label, icon: Icon, exact }) => (
        <NavLink
          key={label}
          to={to(tripId)}
          end={exact}
          className={({ isActive }) =>
            cn(
              'flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
              isActive
                ? 'border-primary text-primary border-b-2'
                : 'text-ink-soft hover:text-foreground border-b-2 border-transparent',
            )
          }
        >
          <Icon className="size-3.5" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
