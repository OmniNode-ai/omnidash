/**
 * Storybook fixture barrel for OMN-100. Each per-widget fixture file
 * exports typed builder functions that import their data interface
 * directly from the widget source — fixtures break loudly when an
 * interface changes, by design.
 *
 * Re-exports here keep story files terse:
 *
 *   import { buildRoutingDecisions, buildEventStream } from '@/storybook/fixtures';
 */

export { buildRoutingDecisions } from './routing';
export type { BuildRoutingDecisionsOptions } from './routing';

export { buildEventStream } from './events';
export type { BuildEventStreamOptions } from './events';

export { buildCostDataPoints } from './cost';
export type { BuildCostDataPointsOptions } from './cost';

export { buildQualitySummary } from './quality';
export type { BuildQualitySummaryOptions } from './quality';

export { buildDelegationMetrics } from './delegation';
export type { BuildDelegationMetricsOptions } from './delegation';

export { buildBaselinesRoi } from './baselines';
export type { BuildBaselinesRoiOptions } from './baselines';

export { buildReadinessRows } from './readiness';
export type { BuildReadinessRowsOptions } from './readiness';
