import type { DashboardDefinition } from '@shared/types/dashboard';

export const platformHealthTemplate: DashboardDefinition = {
  id: 'template-platform-health',
  schemaVersion: '1.0',
  name: 'Platform Health',
  description: 'Operational view: is the platform healthy, are quality scores real, what is happening right now.',
  layout: [
    { i: 'tpl-readiness', componentName: 'readiness-gate', componentVersion: '1.0.0', x: 0, y: 0, w: 12, h: 4, config: {} },
    { i: 'tpl-demo-readiness', componentName: 'demo-readiness', componentVersion: '1.0.0', x: 0, y: 4, w: 12, h: 4, config: {} },
    { i: 'tpl-quality', componentName: 'quality-score-panel', componentVersion: '1.0.0', x: 0, y: 8, w: 6, h: 4, config: {} },
    { i: 'tpl-baselines', componentName: 'baselines-roi-card', componentVersion: '1.0.0', x: 6, y: 8, w: 6, h: 4, config: {} },
    { i: 'tpl-events', componentName: 'event-stream', componentVersion: '1.0.0', x: 0, y: 12, w: 12, h: 6, config: { maxEvents: 200, autoScroll: true } },
  ],
  createdAt: '2026-04-10T00:00:00Z',
  updatedAt: '2026-04-10T00:00:00Z',
  author: 'system',
  shared: true,
};

/** Existing saved Platform Health layouts must gain the status surface too. */
export function repairPlatformHealthDashboard(dashboard: DashboardDefinition): DashboardDefinition {
  if (dashboard.name !== platformHealthTemplate.name && dashboard.id !== platformHealthTemplate.id) return dashboard;
  if (dashboard.layout.some((item) => item.componentName === 'demo-readiness')) return dashboard;
  const templateItem = platformHealthTemplate.layout.find((item) => item.componentName === 'demo-readiness');
  if (!templateItem) throw new Error('Platform Health template is missing demo-readiness');
  const nextY = dashboard.layout.reduce((bottom, item) => Math.max(bottom, item.y + item.h), 0);
  return {
    ...dashboard,
    layout: [...dashboard.layout, { ...templateItem, y: nextY, config: { ...templateItem.config } }],
  };
}
