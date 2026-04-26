import { lazy } from 'react';

export const componentImports: Record<string, ReturnType<typeof lazy>> = {
  'cost-trend/CostTrendPanel': lazy(() => import('./cost-trend/CostTrendPanel')),
  'cost-trend-3d/CostTrend3D': lazy(() => import('./cost-trend-3d/CostTrend3D')),
  'cost-by-model/CostByModelPie': lazy(() => import('./cost-by-model/CostByModelPie')),
  'cost-by-model-2d/CostByModelBars': lazy(() => import('./cost-by-model-2d/CostByModelBars')),
  'delegation/DelegationMetrics': lazy(() => import('./delegation/DelegationMetrics')),
  'routing/RoutingDecisionTable': lazy(() => import('./routing/RoutingDecisionTable')),
  'baselines/BaselinesROICard': lazy(() => import('./baselines/BaselinesROICard')),
  'quality/QualityScorePanel': lazy(() => import('./quality/QualityScorePanel')),
  'quality-score-panel-2d/QualityScoreHistogram': lazy(() => import('./quality-score-panel-2d/QualityScoreHistogram')),
  'readiness/ReadinessGate': lazy(() => import('./readiness/ReadinessGate')),
  'events/EventStream': lazy(() => import('./events/EventStream')),
};
