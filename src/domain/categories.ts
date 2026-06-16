import type { PlaceCategory } from './types';

/**
 * Visual + label metadata for each place category.
 *
 * Categories are distinguished by THREE redundant channels so they are
 * legible without relying on color alone (WCAG):
 *   - `color`  — fill color
 *   - `shape`  — pin silhouette
 *   - `icon`   — a lucide icon name rendered inside the pin and in lists
 */
export type PinShape = 'circle' | 'square' | 'diamond' | 'hexagon' | 'pentagon' | 'triangle';

export interface CategoryMeta {
  key: PlaceCategory;
  label: string;
  /** CSS custom property providing the color. */
  colorVar: string;
  color: string;
  shape: PinShape;
  /** lucide-react icon name. */
  icon: string;
}

export const CATEGORY_META: Record<PlaceCategory, CategoryMeta> = {
  sightseeing: {
    key: 'sightseeing',
    label: '観光',
    colorVar: 'var(--cat-sightseeing)',
    color: '#3a7ca5',
    shape: 'pentagon',
    icon: 'Camera',
  },
  food: {
    key: 'food',
    label: '食事',
    colorVar: 'var(--cat-food)',
    color: '#d9583c',
    shape: 'circle',
    icon: 'Utensils',
  },
  cafe: {
    key: 'cafe',
    label: 'カフェ',
    colorVar: 'var(--cat-cafe)',
    color: '#b5792a',
    shape: 'square',
    icon: 'Coffee',
  },
  lodging: {
    key: 'lodging',
    label: '宿泊',
    colorVar: 'var(--cat-lodging)',
    color: '#7b6aa8',
    shape: 'hexagon',
    icon: 'BedDouble',
  },
  shopping: {
    key: 'shopping',
    label: '買い物',
    colorVar: 'var(--cat-shopping)',
    color: '#c45c93',
    shape: 'diamond',
    icon: 'ShoppingBag',
  },
  transport: {
    key: 'transport',
    label: '移動',
    colorVar: 'var(--cat-transport)',
    color: '#4f9d69',
    shape: 'triangle',
    icon: 'TrainFront',
  },
  other: {
    key: 'other',
    label: 'その他',
    colorVar: 'var(--cat-other)',
    color: '#7a8893',
    shape: 'circle',
    icon: 'MapPin',
  },
};

/** Stable, display-ordered list for selects and legends. */
export const CATEGORY_LIST: CategoryMeta[] = [
  CATEGORY_META.sightseeing,
  CATEGORY_META.food,
  CATEGORY_META.cafe,
  CATEGORY_META.lodging,
  CATEGORY_META.shopping,
  CATEGORY_META.transport,
  CATEGORY_META.other,
];

export const DEFAULT_CATEGORY: PlaceCategory = 'sightseeing';

export function getCategoryMeta(category: PlaceCategory): CategoryMeta {
  return CATEGORY_META[category] ?? CATEGORY_META.other;
}
