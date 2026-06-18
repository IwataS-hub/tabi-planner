import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import L from 'leaflet';
import { CATEGORY_META, type PinShape } from '@/domain/categories';
import { getCategoryLucideIcon } from '@/domain/categoryIcons';
import type { PlaceCategory, VisitStatus } from '@/domain/types';

/**
 * Category markers are drawn as inline SVG `divIcon`s. Each category is encoded
 * by THREE redundant channels — distinct shape, color, and a lucide icon — so
 * pins remain distinguishable without relying on color (WCAG 1.4.1).
 */

// Render each category's lucide icon to an SVG string once, then reuse.
const iconMarkupCache = new Map<PlaceCategory, string>();
function categoryIconMarkup(category: PlaceCategory): string {
  const cached = iconMarkupCache.get(category);
  if (cached) return cached;
  const markup = renderToStaticMarkup(
    createElement(getCategoryLucideIcon(category), {
      width: 18,
      height: 18,
      color: '#ffffff',
      strokeWidth: 2.2,
    }),
  );
  iconMarkupCache.set(category, markup);
  return markup;
}

// Shape outline within a 48x48 viewBox centered on (24, 24).
function shapeSvg(shape: PinShape, color: string): string {
  const common = `fill="${color}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"`;
  switch (shape) {
    case 'square':
      return `<rect x="9" y="9" width="30" height="30" rx="7" ${common} />`;
    case 'diamond':
      return `<polygon points="24,5 43,24 24,43 5,24" ${common} />`;
    case 'hexagon':
      return `<polygon points="24,6 41,15 41,33 24,42 7,33 7,15" ${common} />`;
    case 'pentagon':
      return `<polygon points="24,5 43,19 35,42 13,42 5,19" ${common} />`;
    case 'triangle':
      return `<polygon points="24,7 43,40 5,40" ${common} />`;
    case 'circle':
    default:
      return `<circle cx="24" cy="24" r="16" ${common} />`;
  }
}

const VISIT_STATUS_ARIA: Record<VisitStatus, string> = {
  planned: '予定',
  visited: '訪問済み',
  skipped: 'スキップ',
};

interface PinOptions {
  category: PlaceCategory;
  order: number;
  selected: boolean;
  visitStatus?: VisitStatus;
}

function visitStatusOverlay(status: VisitStatus | undefined): string {
  if (status === 'visited') {
    // Green checkmark badge at top-left
    return `<g>
  <circle cx="9" cy="9" r="7.5" fill="#16a34a" stroke="#ffffff" stroke-width="1.5" />
  <path d="M6 9l2.2 2.5L13 6.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none" />
</g>`;
  }
  if (status === 'skipped') {
    // Grey X badge at top-left
    return `<g>
  <circle cx="9" cy="9" r="7.5" fill="#9ca3af" stroke="#ffffff" stroke-width="1.5" />
  <path d="M6.5 6.5l5 5M11.5 6.5l-5 5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" />
</g>`;
  }
  return '';
}

function pinSvg({ category, order, selected, visitStatus }: PinOptions): string {
  const meta = CATEGORY_META[category];
  const halo = selected
    ? `<circle cx="24" cy="24" r="22" fill="none" stroke="${meta.color}" stroke-width="3" opacity="0.45" />`
    : '';
  const opacity = visitStatus === 'skipped' ? ' opacity="0.45"' : '';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="100%" height="100%">
  <defs>
    <filter id="pinShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.3" flood-color="rgba(20,28,38,0.4)" />
    </filter>
  </defs>
  ${halo}
  <g${opacity}>
    <g filter="url(#pinShadow)">${shapeSvg(meta.shape, meta.color)}</g>
    <g transform="translate(15,15)">${categoryIconMarkup(category)}</g>
    <g>
      <circle cx="39" cy="9" r="8.5" fill="#ffffff" stroke="${meta.color}" stroke-width="1.5" />
      <text x="39" y="12.5" text-anchor="middle" font-size="10" font-weight="700" fill="${meta.color}" font-family="sans-serif">${order}</text>
    </g>
  </g>
  ${visitStatusOverlay(visitStatus)}
</svg>`.trim();
}

/** Build a Leaflet divIcon for a place marker. */
export function createPlaceIcon(options: PinOptions): L.DivIcon {
  const size = options.selected ? 46 : 38;
  const statusLabel = options.visitStatus ? VISIT_STATUS_ARIA[options.visitStatus] : '予定';
  return L.divIcon({
    html: `<div role="img" aria-label="${statusLabel}">${pinSvg(options)}</div>`,
    className: 'tabiori-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}
