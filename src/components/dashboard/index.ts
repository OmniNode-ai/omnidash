import { lazy } from 'react';

export const componentImports: Record<string, ReturnType<typeof lazy>> = {
  'ITrendChartAdapter/threejs': lazy(() => import('./cost-trend/CostTrendAdapter')),
  'IKPITileClusterAdapter/threejs': lazy(() => import('./cost-summary/CostSummaryAdapter')),
  'cost-by-repo/CostByRepoAdapter': lazy(() => import('./cost-by-repo/CostByRepoAdapter')),
  'cost-by-model/CostByModelAdapter': lazy(() => import('./cost-by-model/CostByModelAdapter')),
  'cost-by-model/CostByModel3DAdapter': lazy(() => import('./cost-by-model/CostByModel3DAdapter')),
  'token-usage/TokenUsageAdapter': lazy(() => import('./token-usage/TokenUsageAdapter')),
  // OMN-10291 manifest-dispatch interface keys retained for the future manifest-dispatch
  // architecture. ComponentCell currently passes only { config } and the generic chart
  // adapters expect { projectionData, fieldMappings, emptyState } — until a manifest-side
  // fieldMappings declaration exists, the cost-by-model widgets route through the
  // widget-specific wrappers above (mirroring CostByRepoAdapter / CostTrendAdapter).
  'IBarChartAdapter': lazy(() =>
    import('@/components/charts/threejs/BarChart').then((m) => ({ default: m.BarChart })),
  ),
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
  'ab-compare/AbCompareWidget': lazy(() => import('./ab-compare/AbCompareWidget')),
  'projection-container/ProjectionContainer': lazy(() => import('./projection-container/ProjectionContainer')),
  'intent-distribution/IntentDistributionWidget': lazy(() => import('./intent-distribution/IntentDistributionWidget')),
  'session-timeline/SessionTimelineWidget': lazy(() => import('./session-timeline/SessionTimelineWidget')),
  'live-events/LiveEventStreamWidget': lazy(() => import('./live-events/LiveEventStreamWidget')),
  'routing-decision/RoutingDecisionWidget': lazy(() => import('./routing-decision/RoutingDecisionWidget')),
  'receipt-gate/ReceiptGateWidget': lazy(() => import('./receipt-gate/ReceiptGateWidget')),
  'cost-savings-overview/CostSavingsOverviewWidget': lazy(
    () => import('./cost-savings-overview/CostSavingsOverviewWidget'),
  ),
  'delegation/DelegationSavingsWidget': lazy(() => import('./delegation/DelegationSavingsWidget')),
  'delegation/DelegationModelRoutingWidget': lazy(() => import('./delegation/DelegationModelRoutingWidget')),
  'delegation/DelegationQualityGateWidget': lazy(() => import('./delegation/DelegationQualityGateWidget')),
  'delegation/DelegationTokenUsageWidget': lazy(() => import('./delegation/DelegationTokenUsageWidget')),
};
