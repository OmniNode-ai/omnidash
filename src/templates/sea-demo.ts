import type { DashboardDefinition } from '@shared/types/dashboard';

export const seaDemoTemplate: DashboardDefinition = {
  id: 'template-sea-demo',
  schemaVersion: '1.0',
  name: 'Agent Workbench',
  description: 'Create nodes, delegate tasks, and follow all projected system activity in one continuously refreshed event stream.',
  layout: [
    { i: 'workbench-create-node', componentName: 'control-plane', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 6, config: {} },
    { i: 'workbench-delegate-task', componentName: 'delegate-task', componentVersion: '1.0.0', x: 6, y: 0, w: 6, h: 6, config: {} },
    { i: 'workbench-system-events', componentName: 'live-event-stream', componentVersion: '1.0.0', x: 0, y: 6, w: 12, h: 10, config: {} },
    { i: 'workbench-token-usage', componentName: 'delegation-token-usage', componentVersion: '1.0.0', x: 0, y: 16, w: 12, h: 7, config: {} },
    // OMN-17197 (GOAL row 0). The consumer-flow view belongs in the layout a
    // signed-in user ARRIVES at, not in the palette: a projection nobody opens is
    // the OMN-14440 failure mode, and it had already reproduced inside this epic's
    // own Phase 1 deliverable. `repairSeaDemoDashboard` back-fills it into
    // dashboards saved before this change, so existing operators get it too.
    // `hideIdle: false` is deliberate on the ARRIVAL layout. The widget's own
    // default collapses IDLE rows, which is right for a palette drop onto a
    // focused board; here it would hide three of the four states behind a
    // summary line, and the four-state distinction is the entire deliverable of
    // epic OMN-16776 Phase 1. Rows are severity-ranked, so STALLED and STARVED
    // still read first and IDLE fills the tail rather than burying them.
    { i: 'workbench-consumer-flow', componentName: 'consumer-flow', componentVersion: '1.0.0', x: 0, y: 23, w: 12, h: 7, config: { hideIdle: false } },
  ],
  createdAt: '2026-05-26T00:00:00Z',
  updatedAt: '2026-07-29T00:00:00Z',
  author: 'system',
  shared: true,
};

const SEA_DEMO_REQUIRED_COMPONENTS = new Set(
  seaDemoTemplate.layout.map((item) => item.componentName),
);

export function cloneSeaDemoTemplate(): DashboardDefinition {
  return {
    ...seaDemoTemplate,
    layout: seaDemoTemplate.layout.map((item) => ({
      ...item,
      config: { ...item.config },
    })),
  };
}

export function isSeaDemoDashboard(dashboard: DashboardDefinition): boolean {
  return dashboard.name === seaDemoTemplate.name || dashboard.name === 'SEA Demo' || dashboard.id === seaDemoTemplate.id;
}

export function repairSeaDemoDashboard(dashboard: DashboardDefinition): DashboardDefinition {
  if (!isSeaDemoDashboard(dashboard)) return dashboard;

  if (dashboard.name === 'SEA Demo') {
    return {
      ...dashboard,
      name: seaDemoTemplate.name,
      description: seaDemoTemplate.description,
      updatedAt: seaDemoTemplate.updatedAt,
      layout: seaDemoTemplate.layout.map((item) => ({
        ...item,
        config: { ...item.config },
      })),
    };
  }

  const present = new Set(dashboard.layout.map((item) => item.componentName));
  const missing = seaDemoTemplate.layout.filter(
    (item) => SEA_DEMO_REQUIRED_COMPONENTS.has(item.componentName) && !present.has(item.componentName),
  );

  if (dashboard.layout.length > 0 && missing.length === 0 && dashboard.name === seaDemoTemplate.name) return dashboard;

  return {
    ...dashboard,
    name: seaDemoTemplate.name,
    description: seaDemoTemplate.description,
    updatedAt: seaDemoTemplate.updatedAt,
    layout: [
      ...dashboard.layout,
      ...missing.map((item) => ({
        ...item,
        config: { ...item.config },
      })),
    ],
  };
}
