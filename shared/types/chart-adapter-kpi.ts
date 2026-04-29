/**
 * IKPITileClusterAdapter — adapter interface for the KPITileCluster primitive.
 *
 * Placed in its own file (chart-adapter-kpi.ts) to avoid same-file merge conflicts
 * with parallel Wave-2 primitives (BarChart, TrendChart, DataTable).
 * T8 adapter resolver wires them together.
 *
 * Design Decision 3: adapter pattern keeps the rendering contract explicit.
 * One implementation today (three.js-styled via KPITileCluster.tsx); a future
 * implementation would land at a different path without any interface change.
 *
 * Justification (CREATE NEW): BaselinesROICard (BaselinesROICard.tsx:29) and
 * ReadinessGate (ReadinessGate.tsx:55) both use ad-hoc grid layouts not extracted
 * as reusable. KPITileCluster is a new layout primitive serving multiple SOW
 * iteration-1 widgets (cost-summary at minimum).
 */

import type { ReactElement } from 'react';
import type { KPITileMetricConfig, EmptyStateConfig } from './chart-config';

/**
 * Props accepted by any implementation of the KPITileCluster adapter.
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
 * Per-tile empty states are resolved per tile — if a tile's `field` is absent
 * on the projection row, that tile renders its configured empty state (or the
 * cluster-level default) with reason 'missing-field'. The cluster itself does
 * NOT collapse to a single empty state unless ALL tiles are empty.
 *
 * Any drift from this rule converts a rendering primitive into a hidden projection
 * reducer and violates OmniNode deterministic-truth doctrine.
 */
export interface KPITileClusterAdapterProps<T = Record<string, unknown>> {
  /** Pre-reduced, canonically ordered, contract-valid projection rows. */
  projectionData: T[];
  /** Manifest-declared per-tile metric configs: field, label, optional format, optional per-tile emptyState. */
  tiles: KPITileMetricConfig[];
  /** Cluster-level empty state config. Per-tile configs in KPITileMetricConfig take precedence. */
  emptyState?: EmptyStateConfig;
}

/**
 * Adapter interface for the KPITileCluster primitive.
 *
 * Implementations are React function components whose prop type satisfies
 * `KPITileClusterAdapterProps<T>`. The generic `T` defaults to `Record<string, unknown>`
 * so callers that do not know the exact row shape at compile time can still use
 * this interface without a cast.
 */
export interface IKPITileClusterAdapter<T = Record<string, unknown>> {
  (props: KPITileClusterAdapterProps<T>): ReactElement;
}
