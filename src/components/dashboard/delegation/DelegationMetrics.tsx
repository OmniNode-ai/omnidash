import { lazy, Suspense } from 'react';
import type { WidgetDimension } from '../_shared/types';

// Public re-export: storybook fixtures and other consumers import the
// data shape from the router module (the canonical entry point) rather
// than reaching into the 2D or 3D variant directly.
export type { DelegationSummary } from './DelegationMetrics3D';

const DelegationMetrics2D = lazy(() => import('./DelegationMetrics2D'));
const DelegationMetrics3D = lazy(() => import('./DelegationMetrics3D'));

export interface DelegationMetricsConfig {
  /**
   * '2d' = flat SVG donut, '3d' = tilted three.js doughnut. Default '2d'
   * — the SVG variant is cheaper, more portable, and reads at-a-glance
   * without rotation, which is what most users want for a small panel.
   */
  dimension?: WidgetDimension;
  showSavings?: boolean;
  showQualityGates?: boolean;
  qualityGateThreshold?: number;
}

export default function DelegationMetrics({ config }: { config: DelegationMetricsConfig }) {
  const dimension: WidgetDimension = config.dimension ?? '2d';
  // Sub-widgets accept `Record<string, unknown>`; cast through `unknown`
  // so the structurally-typed config forwards cleanly. Same pattern as
  // CostByModel and QualityScore.
  const passthrough = config as unknown as Record<string, unknown>;
  return (
    <Suspense fallback={null}>
      {dimension === '2d'
        ? <DelegationMetrics2D config={passthrough} />
        : <DelegationMetrics3D config={passthrough} />}
    </Suspense>
  );
}
