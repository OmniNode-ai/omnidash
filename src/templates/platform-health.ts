import type { DashboardDefinition } from '@shared/types/dashboard';

export const platformHealthTemplate: DashboardDefinition = {
  id: 'template-platform-health',
  schemaVersion: '1.0',
  name: 'Platform Health',
  description: 'Operational view: is the platform healthy, are quality scores real, what is happening right now.',
  layout: [
    { i: 'tpl-readiness', componentName: 'readiness-gate', componentVersion: '1.0.0', x: 0, y: 0, w: 12, h: 4, config: {} },
    { i: 'tpl-quality', componentName: 'quality-score-panel', componentVersion: '1.0.0', x: 0, y: 4, w: 6, h: 4, config: {} },
    { i: 'tpl-baselines', componentName: 'baselines-roi-card', componentVersion: '1.0.0', x: 6, y: 4, w: 6, h: 4, config: {} },
    { i: 'tpl-events', componentName: 'event-stream', componentVersion: '1.0.0', x: 0, y: 8, w: 12, h: 6, config: { maxEvents: 200, autoScroll: true } },
  ],
  createdAt: '2026-04-10T00:00:00Z',
  updatedAt: '2026-04-10T00:00:00Z',
  author: 'system',
  shared: true,
};
