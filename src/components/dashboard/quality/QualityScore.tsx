import { lazy, Suspense } from 'react';
import type { WidgetDimension } from '../_shared/types';

// Sub-widgets are lazy-loaded so the dimension the user does NOT select
// does not ship its three.js / chart bundle on first paint.
const QualityScoreHistogram = lazy(() => import('./QualityScoreHistogram'));
const QualityScoreTilted3D = lazy(() => import('./QualityScoreTilted3D'));

export interface QualityScoreConfig {
  /**
   * '2d' = histogram, '3d' = tilted three.js bars. Default '3d' (preserves
   * the pre-merge default behavior — the 3D widget owned the unsuffixed
   * 'Quality Scores' name, so a fresh drag should still render that).
   */
  dimension?: WidgetDimension;
  /** Score at/above which a measurement is counted as passing. Default 0.8. */
  passThreshold?: number;
}

export default function QualityScore({ config }: { config: QualityScoreConfig }) {
  const dimension: WidgetDimension = config.dimension ?? '3d';
  // The two sub-widgets accept the same shape minus `dimension`. Forward
  // verbatim — letting React Suspense handle the lazy boundary.
  return (
    <Suspense fallback={null}>
      {dimension === '2d'
        ? <QualityScoreHistogram config={config} />
        : <QualityScoreTilted3D config={config} />}
    </Suspense>
  );
}
