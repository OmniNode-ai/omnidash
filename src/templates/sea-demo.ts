import type { DashboardDefinition } from '@shared/types/dashboard';

export const seaDemoTemplate: DashboardDefinition = {
  id: 'template-sea-demo',
  schemaVersion: '1.0',
  name: 'SEA Demo',
  description: 'Self-extending agent demo pipeline: generation control, live event flow, traces, token usage, and MCP tool registry.',
  layout: [
    { i: 'sea-control', componentName: 'control-plane', componentVersion: '1.0.0', x: 0, y: 0, w: 6, h: 8, config: {} },
    { i: 'sea-events', componentName: 'live-event-stream', componentVersion: '1.0.0', x: 6, y: 0, w: 6, h: 8, config: {} },
    { i: 'sea-abcompare', componentName: 'ab-compare', componentVersion: '1.0.0', x: 0, y: 8, w: 12, h: 7, config: {} },
    { i: 'sea-trace', componentName: 'trace-explorer', componentVersion: '1.0.0', x: 0, y: 15, w: 6, h: 8, config: {} },
    { i: 'sea-tokens', componentName: 'delegation-token-usage', componentVersion: '1.0.0', x: 6, y: 15, w: 6, h: 8, config: {} },
    { i: 'sea-model-output', componentName: 'delegation-model-output', componentVersion: '1.0.0', x: 0, y: 23, w: 6, h: 7, config: { showFullOutput: true, maxHistory: 2 } },
    { i: 'sea-mcp', componentName: 'mcp-tools', componentVersion: '1.0.0', x: 6, y: 23, w: 6, h: 5, config: {} },
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
