import { createElement } from 'react';
import { getCategoryLucideIcon } from '@/domain/categoryIcons';
import type { PlaceCategory } from '@/domain/types';

/** Renders the lucide icon for a category. Uses createElement so the icon
 * component is resolved from a static map rather than bound during render. */
export function CategoryIcon({
  category,
  className,
}: {
  category: PlaceCategory;
  className?: string;
}) {
  return createElement(getCategoryLucideIcon(category), {
    className,
    'aria-hidden': true,
  });
}
