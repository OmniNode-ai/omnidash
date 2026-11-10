import { lazy, Suspense } from 'react';
import type { EChartProps } from './echarts-canvas';

const Canvas = lazy(() => import('./echarts-canvas'));

/**
 * OMN-23330 AC22: an ECharts canvas whose library loads with the first chart that needs it, not with the page bundle.
 * While it loads, the canvas keeps its box (the same class), so the page does not move. Unit tests resolve this module to
 * echarts-canvas.tsx (vitest.config.ts), so they keep rendering charts in one pass; the Playwright suite runs the lazy path.
 */
export function EChart(props: EChartProps) {
  return <Suspense fallback={<div className="local-chart-canvas" aria-busy="true" />}><Canvas {...props} /></Suspense>;
}
