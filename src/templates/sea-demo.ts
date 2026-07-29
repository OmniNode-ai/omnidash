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
