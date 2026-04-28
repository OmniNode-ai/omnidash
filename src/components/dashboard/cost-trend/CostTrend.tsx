import { lazy, Suspense } from 'react';
import type { WidgetDimension } from '../_shared/types';

// Sub-widgets are lazy-loaded so a 2D-Area selection does not pay the
// three.js bundle cost up front.
const CostTrend2D = lazy(() => import('./CostTrend2D'));
const CostTrend3DBars = lazy(() => import('./CostTrend3DBars'));
const CostTrend3DArea = lazy(() => import('./CostTrend3DArea'));

export interface CostTrendConfig {
  /** '2d' = flat chart, '3d' = three.js scene. Default '2d'. */
  dimension?: WidgetDimension;
  /**
   * 'area' = stacked area, 'bar' = stacked bars. Default 'area'.
   * Inline string-literal union rather than a named alias —
   * CostTrend2D.tsx already has its own local ChartType for the same
   * values; introducing a third name would be the kind of duplication
   * R7 flags. Kept inline so this surface stays the single source of
   * truth for the merged widget's config.
   */
  style?: 'area' | 'bar';
  /** Forwarded to CostTrend2D when dimension=2d. */
  granularity?: 'hour' | 'day';
}

export default function CostTrend({ config }: { config: CostTrendConfig }) {
  const dimension: WidgetDimension = config.dimension ?? '2d';
  const style: 'area' | 'bar' = config.style ?? 'area';

  if (dimension === '2d') {
    // CostTrend2D's existing API uses `chartType` for the area/bar switch.
    // Forward `style` as `chartType` rather than introducing a parallel name.
    return (
      <Suspense fallback={null}>
        <CostTrend2D config={{ ...config, chartType: style }} />
      </Suspense>
    );
  }
  // 3D sub-widgets accept `Record<string, unknown>`; cast through `unknown`
  // so the structurally-typed CostTrendConfig forwards cleanly.
  const passthrough = config as unknown as Record<string, unknown>;
  return (
    <Suspense fallback={null}>
      {style === 'area'
        ? <CostTrend3DArea config={passthrough} />
        : <CostTrend3DBars config={passthrough} />}
    </Suspense>
  );
}
