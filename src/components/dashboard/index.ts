import { lazy } from 'react';

export const componentImports: Record<string, ReturnType<typeof lazy>> = {
  'ITrendChartAdapter/threejs': lazy(() => import('./cost-trend/CostTrendAdapter')),
  'IKPITileClusterAdapter/threejs': lazy(() => import('./cost-summary/CostSummaryAdapter')),
  // cost-by-model (2D): manifest-dispatched via IBarChartAdapter → BarChartThreeJs (OMN-10291).
  'IBarChartAdapter': lazy(() =>
    import('@/components/charts/threejs/BarChart').then((m) => ({ default: m.BarChart })),
  ),
  // cost-by-model-3d (3D): manifest-dispatched via IDoughnutChartAdapter → DoughnutChartAdapterThreeJs (OMN-10291).
  'IDoughnutChartAdapter': lazy(() =>
    import('@/components/charts/threejs/DoughnutChartAdapter').then((m) => ({
      default: m.DoughnutChartAdapter,
    })),
  ),
  'delegation/DelegationMetrics': lazy(() => import('./delegation/DelegationMetrics')),
  'routing/RoutingDecisionTable': lazy(() => import('./routing/RoutingDecisionTable')),
  'baselines/BaselinesROICard': lazy(() => import('./baselines/BaselinesROICard')),
  'quality/QualityScore': lazy(() => import('./quality/QualityScore')),
  'readiness/ReadinessGate': lazy(() => import('./readiness/ReadinessGate')),
  'events/EventStream': lazy(() => import('./events/EventStream')),
};
