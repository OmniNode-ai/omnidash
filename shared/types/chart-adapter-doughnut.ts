/**
 * IDoughnutChartAdapter — adapter interface for the DoughnutChart primitive.
 *
 * Placed in its own file to mirror the pattern of other T4-T7 adapters.
 * T8 adapter resolver wires it to DoughnutChartAdapter (three.js 3D pie).
 *
 * The doughnut adapter renders a proportional slice chart where each row
 * represents one model's cost share. projectionData rows must declare
 * `model_name` and `total_cost_usd` per the `llm_cost_aggregates` schema.
 */

import type { ReactElement } from 'react';
import type { EmptyStateConfig } from './chart-config';

/**
 * Field-mapping spec for doughnut/pie chart primitives.
 *
 * `label` maps to the per-slice display name (e.g. model_name).
 * `value` maps to the numeric value field driving slice arc (e.g. total_cost_usd).
 */
export interface DoughnutChartFieldMapping {
  /** Name of the projection row field to use as the per-slice label. */
  label: string;
  /** Name of the projection row field to use as the per-slice numeric value. */
  value: string;
  /** Optional d3-compatible format string for tooltip/legend values. */
  format?: string;
}

/**
 * Props accepted by any implementation of the DoughnutChart adapter.
 *
 * **Adapter input contract:**
 * `projectionData` must already be projection-reduced, canonically ordered, and
 * contract-valid. Adapter implementations MUST map fields and render ONLY.
 */
export interface DoughnutChartAdapterProps<T = Record<string, unknown>> {
  /** Pre-reduced, canonically ordered, contract-valid projection rows. */
  projectionData: T[];
  /** Manifest-declared field mapping: label and value fields. */
  fieldMappings: DoughnutChartFieldMapping;
  /** Empty state config per EmptyStateReason. */
  emptyState?: EmptyStateConfig;
}

/**
 * Adapter interface for the DoughnutChart primitive (3D pie).
 *
 * Implementations are React function components whose prop type satisfies
 * `DoughnutChartAdapterProps<T>`.
 */
export interface IDoughnutChartAdapter<T = Record<string, unknown>> {
  (props: DoughnutChartAdapterProps<T>): ReactElement;
}
