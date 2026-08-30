import { describe, it, expect } from 'vitest';
import { DASHBOARD_TEMPLATES } from './index';
import { validateDashboardDefinition } from '@shared/types/dashboard';
import { repairSeaDemoDashboard, seaDemoTemplate } from './sea-demo';

describe('Dashboard Templates', () => {
  it('has 4 templates', () => {
    expect(DASHBOARD_TEMPLATES.length).toBe(4);
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

  it('Delegation Evidence template has the composable control plane', () => {
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.name === 'Delegation Evidence');
    expect(tpl).toBeDefined();
    expect(tpl!.layout.length).toBe(1);
    expect(tpl!.layout[0].componentName).toBe('delegation-control-plane');
  });

  it('Agent Workbench keeps actions separate and has one shared event stream', () => {
    const tpl = DASHBOARD_TEMPLATES.find((t) => t.name === 'Agent Workbench');
    expect(tpl).toBeDefined();
    expect(tpl!.layout.map((l) => l.componentName)).toEqual([
      'control-plane',
      'delegate-task',
      'live-event-stream',
      'delegation-token-usage',
      // OMN-17197 (GOAL row 0): consumer-flow lands in the ARRIVAL layout, not the
      // palette — a projection nobody opens is the OMN-14440 failure mode.
      'consumer-flow',
    ]);
    expect(tpl!.layout.filter((item) => item.componentName === 'live-event-stream')).toHaveLength(1);
  });

  it('repairs an empty persisted workbench from the template', () => {
    const repaired = repairSeaDemoDashboard({
      ...seaDemoTemplate,
      id: 'dash-sea-demo',
      layout: [],
    });

    expect(repaired.id).toBe('dash-sea-demo');
    expect(repaired.layout.map((l) => l.componentName)).toEqual([
      'control-plane',
      'delegate-task',
      'live-event-stream',
      'delegation-token-usage',
      // OMN-17197 (GOAL row 0): consumer-flow lands in the ARRIVAL layout, not the
      // palette — a projection nobody opens is the OMN-14440 failure mode.
      'consumer-flow',
    ]);
  });

  it('migrates the legacy SEA Demo name and layout to Agent Workbench', () => {
    const repaired = repairSeaDemoDashboard({
      ...seaDemoTemplate,
      id: 'legacy-sea-demo',
      name: 'SEA Demo',
      layout: [
        { i: 'legacy-control', componentName: 'control-plane', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 8, config: {} },
        { i: 'legacy-tokens', componentName: 'delegation-token-usage', componentVersion: '1.0.0', x: 6, y: 0, w: 6, h: 8, config: {} },
      ],
    });

    expect(repaired.name).toBe('Agent Workbench');
    expect(repaired.layout).toEqual(seaDemoTemplate.layout);
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
