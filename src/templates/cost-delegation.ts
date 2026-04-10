import type { DashboardDefinition } from '@shared/types/dashboard';

export const costDelegationTemplate: DashboardDefinition = {
  id: 'template-cost-delegation',
  schemaVersion: '1.0',
  name: 'Cost & Delegation',
  description: 'Cost savings story: what is delegated, how much it saves, what routing decisions drive it.',
  layout: [
    { i: 'tpl-cost-trend', componentName: 'cost-trend-panel', componentVersion: '1.0.0', x: 0, y: 0, w: 8, h: 5, config: { granularity: 'day', showBudgetLine: true } },
    { i: 'tpl-delegation', componentName: 'delegation-metrics', componentVersion: '1.0.0', x: 8, y: 0, w: 4, h: 5, config: { showSavings: true, showQualityGates: true } },
    { i: 'tpl-routing', componentName: 'routing-decision-table', componentVersion: '1.0.0', x: 0, y: 5, w: 12, h: 6, config: { pageSize: 20 } },
  ],
  createdAt: '2026-04-10T00:00:00Z',
  updatedAt: '2026-04-10T00:00:00Z',
  author: 'system',
  shared: true,
};
