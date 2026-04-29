/**
 * IBarChartAdapter — adapter interface for the BarChart primitive.
 *
 * Placed in its own file (chart-adapter-bar.ts) to avoid same-file merge conflicts
 * with parallel Wave-2 primitives (TrendChart, KPITileCluster, DataTable).
 * T8 adapter resolver wires them together.
 *
 * Design Decision 3: adapter pattern keeps the rendering contract explicit.
 * One implementation today (three.js via StackedChart); a future Recharts implementation
 * would land at omnidash/src/components/charts/recharts/BarChart.tsx without any
 * interface change.
 */

import type { ReactElement } from 'react';
import type { BarChartFieldMapping, EmptyStateConfig } from './chart-config';
import type { ProjectionOrderingAuthority } from './component-manifest';

/**
 * Props accepted by any implementation of the BarChart adapter.
 *
 * **Adapter input contract (enforced by this interface):**
 * `projectionData` must already be projection-reduced, canonically ordered, and
 * contract-valid according to the manifest's `projectionSchema`. Adapter implementations
 * MUST map fields and render ONLY. They MUST NOT:
 * - infer authoritative state
 * - merge streams
 * - deduplicate records
 * - repair ordering
 * - apply reducer semantics
 *
 * Any drift from this rule converts a rendering primitive into a hidden projection
 * reducer and violates OmniNode deterministic-truth doctrine.
 */
export interface BarChartAdapterProps<T = Record<string, unknown>> {
  /** Pre-reduced, canonically ordered, contract-valid projection rows. */
  projectionData: T[];
  /** Manifest-declared field mapping: which row fields map to x, y, optional groupBy. */
  fieldMappings: BarChartFieldMapping;
  /** Empty state config per EmptyStateReason. Must not collapse schema-invalid into no-data. */
  emptyState?: EmptyStateConfig;
  /** Declared ordering authority for the projection. Used for validation, not reordering. */
  orderingAuthority?: ProjectionOrderingAuthority;
}

/**
 * Adapter interface for the BarChart primitive.
 *
 * Implementations are React function components whose prop type satisfies
 * `BarChartAdapterProps<T>`. The generic `T` defaults to `Record<string, unknown>`
 * so callers that do not know the exact row shape at compile time can still use
 * this interface without a cast.
 */
export interface IBarChartAdapter<T = Record<string, unknown>> {
  (props: BarChartAdapterProps<T>): ReactElement;
}
