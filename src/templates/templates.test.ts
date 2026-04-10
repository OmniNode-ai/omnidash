import { describe, it, expect } from 'vitest';
import { DASHBOARD_TEMPLATES } from './index';
import { validateDashboardDefinition } from '@shared/types/dashboard';

describe('Dashboard Templates', () => {
  it('has 2 templates', () => {
    expect(DASHBOARD_TEMPLATES.length).toBe(2);
  });

  it('Cost & Delegation template has 3 components', () => {
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.name === 'Cost & Delegation');
    expect(tpl).toBeDefined();
    expect(tpl!.layout.length).toBe(3);
    expect(tpl!.layout.map((l) => l.componentName).sort()).toEqual([
      'cost-trend-panel',
      'delegation-metrics',
      'routing-decision-table',
    ]);
  });

  it('Platform Health template has 4 components', () => {
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.name === 'Platform Health');
    expect(tpl).toBeDefined();
    expect(tpl!.layout.length).toBe(4);
    expect(tpl!.layout.map((l) => l.componentName).sort()).toEqual([
      'baselines-roi-card',
      'event-stream',
      'quality-score-panel',
      'readiness-gate',
    ]);
  });

  it('all templates pass validation', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      const result = validateDashboardDefinition(tpl);
      expect(result.valid).toBe(true);
    }
  });

  it('no two layout items share the same grid coordinates', () => {
    for (const tpl of DASHBOARD_TEMPLATES) {
      const seen = new Set<string>();
      for (const item of tpl.layout) {
        for (let col = item.x; col < item.x + item.w; col++) {
          for (let row = item.y; row < item.y + item.h; row++) {
            const key = `${col},${row}`;
            expect(seen.has(key), `Overlap detected at col=${col} row=${row} in template "${tpl.name}"`).toBe(false);
            seen.add(key);
          }
        }
      }
    }
  });
});
