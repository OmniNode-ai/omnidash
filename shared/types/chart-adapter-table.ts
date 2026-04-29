/**
 * Adapter interface for generic data table primitives.
 *
 * Per-primitive file per OMN-10289 conflict-avoidance strategy.
 * Sibling adapter files (chart-adapter-bar.ts, chart-adapter-trend.ts, etc.)
 * follow the same per-primitive pattern.
 *
 * Doctrine: `projectionData` must arrive pre-validated and canonically ordered.
 * Adapters render; they do not infer authoritative state, merge streams, or
 * apply reducer semantics. Any such logic converts a rendering primitive into
 * a hidden projection reducer and violates OmniNode deterministic truth doctrine.
 */

import type React from 'react';
import type { DataTableColumnConfig, EmptyStateConfig } from './chart-config';

export interface IDataTableAdapter<T extends Record<string, unknown> = Record<string, unknown>> {
  (props: {
    /**
     * Projection-reduced, canonically ordered, contract-valid rows.
     * Adapters must not re-order, deduplicate, or repair these rows.
     */
    projectionData: T[];
    /** Per-column render/sort/search configuration. */
    columns: DataTableColumnConfig[];
    /** Rows per page. Defaults to 25 when omitted. */
    pageSize?: number;
    /** Empty-state messaging configuration. */
    emptyState?: EmptyStateConfig;
  }): React.ReactElement;
}
