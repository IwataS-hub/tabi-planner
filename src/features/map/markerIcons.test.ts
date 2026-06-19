import { describe, expect, it } from 'vitest';
import { createPlaceIcon } from './markerIcons';

describe('createPlaceIcon visitStatus', () => {
  it('aria-label is "予定" for planned status', () => {
    const icon = createPlaceIcon({
      category: 'sightseeing',
      order: 1,
      selected: false,
      visitStatus: 'planned',
    });
    expect(icon.options.html).toContain('aria-label="予定"');
  });

  it('aria-label is "訪問済み" for visited status', () => {
    const icon = createPlaceIcon({
      category: 'sightseeing',
      order: 1,
      selected: false,
      visitStatus: 'visited',
    });
    expect(icon.options.html).toContain('aria-label="訪問済み"');
  });

  it('aria-label is "スキップ" for skipped status', () => {
    const icon = createPlaceIcon({
      category: 'sightseeing',
      order: 1,
      selected: false,
      visitStatus: 'skipped',
    });
    expect(icon.options.html).toContain('aria-label="スキップ"');
  });

  it('visited icon contains a green checkmark overlay', () => {
    const icon = createPlaceIcon({
      category: 'food',
      order: 2,
      selected: false,
      visitStatus: 'visited',
    });
    expect(icon.options.html).toContain('#16a34a');
  });

  it('skipped icon renders with reduced opacity', () => {
    const icon = createPlaceIcon({
      category: 'lodging',
      order: 3,
      selected: false,
      visitStatus: 'skipped',
    });
    expect(icon.options.html).toContain('opacity="0.45"');
  });

  it('skipped icon contains a grey X overlay', () => {
    const icon = createPlaceIcon({
      category: 'shopping',
      order: 4,
      selected: false,
      visitStatus: 'skipped',
    });
    expect(icon.options.html).toContain('#9ca3af');
  });

  it('planned icon has no visit-status overlay', () => {
    const icon = createPlaceIcon({
      category: 'sightseeing',
      order: 1,
      selected: false,
      visitStatus: 'planned',
    });
    const html = icon.options.html as string;
    // Should not have green (visited) or grey (skipped) overlay colors
    expect(html).not.toContain('#16a34a');
    expect(html).not.toContain('#9ca3af');
  });
});
