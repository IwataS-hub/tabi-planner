import { CATEGORY_LIST } from '@/domain/categories';
import { CategoryIcon } from '@/components/CategoryIcon';

/** Compact legend mapping category color/icon to label (also key for the map). */
export function MapLegend() {
  return (
    <ul className="text-ink-soft flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      {CATEGORY_LIST.map((meta) => (
        <li key={meta.key} className="flex items-center gap-1">
          <span
            className="flex size-4 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: meta.color }}
          >
            <CategoryIcon category={meta.key} className="size-2.5" />
          </span>
          {meta.label}
        </li>
      ))}
    </ul>
  );
}
