import type React from 'react';
import type { TrendChartFieldMapping, EmptyStateConfig } from './chart-config';
import type { ProjectionOrderingAuthority } from './component-manifest';

/**
 * Adapter interface for trend (time-series) chart primitives.
 *
 * Input contract:
 *   - `projectionData` must be projection-reduced, canonically ordered
 *     (typically by `bucket_time` monotonic ascending), and contract-valid.
 *   - Adapters may map fields and render, but MUST NOT infer authoritative
 *     state, merge streams, deduplicate records, repair ordering, or apply
 *     reducer semantics. Doing so converts a rendering primitive into a
 *     hidden projection reducer, violating OmniNode doctrine.
 *   - `orderingAuthority` declares the canonical order contract; adapters
 *     trust this contract and MUST NOT re-sort projectionData.
 *
 * Per-primitive file (not shared chart-adapter.ts) to avoid coupling
 * between sibling primitives during parallel development (Wave 2 pattern).
 */
export interface ITrendChartAdapter<T = Record<string, unknown>> {
  (props: {
    projectionData: T[];
    fieldMappings: TrendChartFieldMapping;
    emptyState?: EmptyStateConfig;
    orderingAuthority?: ProjectionOrderingAuthority;
  }): React.ReactElement;
}
