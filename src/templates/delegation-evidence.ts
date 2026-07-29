import type { DashboardDefinition } from '@shared/types/dashboard';

export const delegationEvidenceTemplate: DashboardDefinition = {
  id: 'template-delegation-evidence',
  schemaVersion: '1.0',
  name: 'Delegation Evidence',
  description: 'Market delegation proof surface organized by run, projection status, event chain, topology, artifacts, and metric panels.',
  layout: [
    {
      i: 'tpl-delegation-control-plane',
      componentName: 'delegation-control-plane',
      componentVersion: '1.0.0',
      x: 0,
      y: 0,
      w: 12,
      h: 12,
      config: { defaultTab: 'projection', maxRuns: 12 },
    },
  ],
  createdAt: '2026-05-22T00:00:00Z',
  updatedAt: '2026-05-22T00:00:00Z',
  author: 'system',
  shared: true,
};
