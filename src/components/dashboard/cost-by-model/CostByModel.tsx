import { lazy, Suspense } from 'react';
import type { WidgetDimension } from '../_shared/types';

const CostByModelBars = lazy(() => import('./CostByModelBars'));
const CostByModelPie = lazy(() => import('./CostByModelPie'));

export interface CostByModelConfig {
  /**
   * '2d' = horizontal/vertical bars, '3d' = tilted pie. Default '2d'
   * (preserves the pre-merge default behavior — bars owned the unsuffixed
   * 'Cost by Model' name).
   */
  dimension?: WidgetDimension;
}

export default function CostByModel({ config }: { config: CostByModelConfig }) {
  const dimension: WidgetDimension = config.dimension ?? '2d';
  // Sub-widgets accept `Record<string, unknown>`; cast through `unknown`
  // so the structurally-typed CostByModelConfig forwards cleanly.
  const passthrough = config as unknown as Record<string, unknown>;
  return (
    <Suspense fallback={null}>
      {dimension === '2d'
        ? <CostByModelBars config={passthrough} />
        : <CostByModelPie config={passthrough} />}
    </Suspense>
  );
}
