/**
 * Chart manifest config schema types — sibling file to component-manifest.ts.
 *
 * These types represent the manifest-declared field-mapping specs, not runtime data rows.
 * Each type has an explicit non-reuse justification documented in the Known Types Inventory
 * of docs/plans/2026-04-29-omnidash-generic-widgets.md.
 *
 * Design Decision 2: field-mapping types live here (not inside component-manifest.ts) to
 * keep the envelope file focused and avoid bloat.
 */

/**
 * Field-mapping spec for bar chart primitives.
 *
 * Not reusing `StackedSlice` because `StackedSlice` is the runtime-shaped data row consumed
 * by `StackedChart`, not the manifest-declared field-mapping spec. Manifest config is
 * `{ x: <fieldName>, y: <fieldName>, group?: <fieldName>, format?: <formatSpec> }`;
 * runtime row is `{ x, segments }`. Different layers — manifest is config; slice is data.
 */
export interface BarChartFieldMapping {
  /** Name of the projection row field to use as the x-axis category. */
  x: string;
  /** Name of the projection row field to use as the y-axis value. */
  y: string;
  /** Optional grouping field for stacked/grouped bar variants. */
  group?: string;
  /** Optional d3-compatible format string (e.g. '$,.2f') for axis/tooltip labels. */
  format?: string;
}

/**
 * Field-mapping spec for trend (time-series) chart primitives.
 *
 * Not reusing `BarChartFieldMapping` because trend charts add a temporal-axis `granularity`
 * config ('hour' | 'day' | 'week') that is meaningless for non-temporal bar charts.
 * Subtyping via union with `BarChartFieldMapping` would force every `<BarChart>` consumer
 * to handle granularity null.
 *
 * Normalization: `x` IS the bucket field (no separate `bucketField`). Manifest entries
 * declare the bucket source column directly via `x`. Adapters consume `granularity` only
 * to label/format the axis; bucketing has already been performed upstream by the projection.
 */
export interface TrendChartFieldMapping {
  /**
   * Name of the projection row field to use as the time bucket (x-axis).
   * This is the bucket field — no separate `bucketField` is needed. Bucketing
   * is performed upstream by the projection node; adapters only render.
   */
  x: string;
  /** Name of the projection row field to use as the value (y-axis). */
  y: string;
  /** Optional grouping field for multi-series trend variants. */
  group?: string;
  /** Temporal granularity — used only for axis label/format, not for bucketing. */
  granularity: 'hour' | 'day' | 'week';
  /** Optional d3-compatible format string for value labels. */
  format?: string;
}

/**
 * Per-tile metric configuration for KPI tile cluster primitives.
 *
 * Not reusing existing widget configs (e.g. `BaselinesSummary`) because existing configs
 * are widget-specific data shapes; this type is a generic per-tile metric spec
 * (`field`, `label`, `format`, `emptyState`) reusable across many manifest entries.
 */
export interface KPITileMetricConfig {
  /** Name of the projection row field to display as the tile value. */
  field: string;
  /** Human-readable label shown above the tile value. */
  label: string;
  /** Optional d3-compatible format string (e.g. '$,.2f', '.1%'). */
  format?: string;
  /** Optional per-tile empty state — overrides cluster-level empty state for this tile. */
  emptyState?: EmptyStateConfig;
}

/**
 * Column configuration for generic data table primitives.
 *
 * Not reusing column types from `RoutingDecisionTable.tsx` because the existing table has
 * no exported column-config type — sort/page/search are inlined inside the component.
 * Extracting a generic column config is the point of Task 7.
 */
export interface DataTableColumnConfig {
  /** Name of the projection row field this column renders. */
  field: string;
  /** Human-readable column header text. */
  header: string;
  /** Whether this column is sortable. */
  sortable?: boolean;
  /** Whether this column is included in full-text search. */
  searchable?: boolean;
  /** Optional d3-compatible format string for cell values. */
  format?: string;
  /** Optional explicit pixel width. Omit to let the table auto-size. */
  width?: number;
  /**
   * When true, this column is declared in the display schema but the upstream
   * projection does not yet emit the field. The header is rendered; each cell
   * shows an empty state (reason: 'missing-field') rather than a value.
   * Callers must NOT substitute a fallback literal such as '--' or 'N/A'.
   */
  upstreamBlocked?: boolean;
}

/**
 * Reason codes for empty/error states across all chart primitives.
 *
 * Primitives MUST render the configured empty state for each applicable reason and MUST NOT
 * collapse 'schema-invalid' into 'no-data'. Each reason maps to a distinct diagnostic
 * message so operators can distinguish "no records yet" from "upstream pipeline blocked".
 */
export type EmptyStateReason =
  | 'no-data'
  | 'missing-field'
  | 'upstream-blocked'
  | 'schema-invalid';

/**
 * Empty state configuration for chart primitives.
 *
 * Not reusing any existing type because no current widget standardizes empty-state behavior.
 * SOW G6 (no fallback constants) requires every primitive accept an explicit empty-state
 * config — message, icon, action.
 *
 * Supports distinguished reason codes so 'schema-invalid' is never silently folded into
 * 'no-data'. Manifest entries declare a per-reason message; default messages are provided
 * for omitted reasons.
 */
export interface EmptyStateConfig {
  /**
   * Per-reason messages and optional call-to-action labels.
   * Omitted reasons fall back to `defaultMessage`.
   */
  reasons?: Partial<Record<EmptyStateReason, { message: string; cta?: string }>>;
  /** Fallback message used when no per-reason override is provided. */
  defaultMessage?: string;
}
