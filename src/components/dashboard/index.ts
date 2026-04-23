import { lazy } from 'react';

export const componentImports: Record<string, ReturnType<typeof lazy>> = {
  'cost-trend/CostTrendPanel': lazy(() => import('./cost-trend/CostTrendPanel')),
  'cost-trend-3d/CostTrend3D': lazy(() => import('./cost-trend-3d/CostTrend3D')),
  'delegation/DelegationMetrics': lazy(() => import('./delegation/DelegationMetrics')),
  'routing/RoutingDecisionTable': lazy(() => import('./routing/RoutingDecisionTable')),
  'baselines/BaselinesROICard': lazy(() => import('./baselines/BaselinesROICard')),
  'quality/QualityScorePanel': lazy(() => import('./quality/QualityScorePanel')),
  'readiness/ReadinessGate': lazy(() => import('./readiness/ReadinessGate')),
  'events/EventStream': lazy(() => import('./events/EventStream')),
};
