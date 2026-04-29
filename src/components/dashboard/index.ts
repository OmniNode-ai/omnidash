import { lazy } from 'react';

export const componentImports: Record<string, ReturnType<typeof lazy>> = {
  'ITrendChartAdapter/threejs': lazy(() => import('./cost-trend/CostTrendAdapter')),
  'IKPITileClusterAdapter/threejs': lazy(() => import('./cost-summary/CostSummaryAdapter')),
  'cost-by-model/CostByModel': lazy(() => import('./cost-by-model/CostByModel')),
  'delegation/DelegationMetrics': lazy(() => import('./delegation/DelegationMetrics')),
  'routing/RoutingDecisionTable': lazy(() => import('./routing/RoutingDecisionTable')),
  'baselines/BaselinesROICard': lazy(() => import('./baselines/BaselinesROICard')),
  'quality/QualityScore': lazy(() => import('./quality/QualityScore')),
  'readiness/ReadinessGate': lazy(() => import('./readiness/ReadinessGate')),
  'events/EventStream': lazy(() => import('./events/EventStream')),
};
