import type { DashboardDefinition } from '@shared/types/dashboard';

export const seaDemoTemplate: DashboardDefinition = {
  id: 'template-sea-demo',
  schemaVersion: '1.0',
  name: 'SEA Demo',
  description: 'Self-extending agent demo pipeline with canonical generation artifact proof and projection-backed delegation token usage.',
  layout: [
    { i: 'sea-control', componentName: 'control-plane', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 8, config: {} },
    { i: 'sea-tokens', componentName: 'delegation-token-usage', componentVersion: '1.0.0', x: 6, y: 0, w: 6, h: 8, config: {} },
  ],
  createdAt: '2026-05-26T00:00:00Z',
  updatedAt: '2026-05-26T00:00:00Z',
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
  return dashboard.name === seaDemoTemplate.name || dashboard.id === seaDemoTemplate.id;
}

export function repairSeaDemoDashboard(dashboard: DashboardDefinition): DashboardDefinition {
  if (!isSeaDemoDashboard(dashboard)) return dashboard;

  const present = new Set(dashboard.layout.map((item) => item.componentName));
  const missing = seaDemoTemplate.layout.filter(
    (item) => SEA_DEMO_REQUIRED_COMPONENTS.has(item.componentName) && !present.has(item.componentName),
  );

  if (dashboard.layout.length > 0 && missing.length === 0) return dashboard;

  return {
    ...dashboard,
    layout: [
      ...dashboard.layout,
      ...missing.map((item) => ({
        ...item,
        config: { ...item.config },
      })),
    ],
  };
}
