import { describe, it, expect } from 'vitest';
import { buildUserContext } from './contextUtils';

describe('buildUserContext', () => {
  it('returns empty context string when layout is empty', () => {
    const ctx = buildUserContext({ layout: [], filters: {} });
    expect(ctx).toContain('empty dashboard');
  });

  it('lists component names in current layout', () => {
    const ctx = buildUserContext({
      layout: [
        { i: 'a', componentName: 'cost-trend-panel', x: 0, y: 0, w: 6, h: 4, componentVersion: '1.0.0', config: {} },
        { i: 'b', componentName: 'event-stream', x: 6, y: 0, w: 6, h: 4, componentVersion: '1.0.0', config: {} },
      ],
      timeRange: { start: '2025-01-01T00:00:00Z', end: '2025-01-08T00:00:00Z' },
      filters: { repo: 'omniclaude' },
    });
    expect(ctx).toContain('cost-trend-panel');
    expect(ctx).toContain('event-stream');
    expect(ctx).toContain('2025-01-01');
  });

  it('stays under 500 characters to avoid bloating the context window', () => {
    const layout = Array.from({ length: 20 }, (_, i) => ({
      i: `item-${i}`,
      componentName: 'cost-trend-panel',
      x: 0,
      y: i * 4,
      w: 12,
      h: 4,
      componentVersion: '1.0.0',
      config: {},
    }));
    const ctx = buildUserContext({ layout, filters: {} });
    expect(ctx.length).toBeLessThan(500);
  });

  it('omits filter string when no filters are set', () => {
    const ctx = buildUserContext({
      layout: [{ i: 'a', componentName: 'cost-trend-panel', x: 0, y: 0, w: 6, h: 4, componentVersion: '1.0.0', config: {} }],
      filters: {},
    });
    expect(ctx).not.toContain('filters');
  });
});
