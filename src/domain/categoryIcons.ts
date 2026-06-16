import {
  BedDouble,
  Camera,
  Coffee,
  MapPin,
  ShoppingBag,
  TrainFront,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { getCategoryMeta } from './categories';
import type { PlaceCategory } from './types';

/** Maps the icon names stored in CATEGORY_META to their lucide components. */
const ICONS: Record<string, LucideIcon> = {
  Camera,
  Utensils,
  Coffee,
  BedDouble,
  ShoppingBag,
  TrainFront,
  MapPin,
};

export function getCategoryLucideIcon(category: PlaceCategory): LucideIcon {
  return ICONS[getCategoryMeta(category).icon] ?? MapPin;
}
