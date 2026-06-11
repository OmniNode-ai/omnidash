import type { JSONSchema7 } from 'json-schema';
import type { EmptyStateReason } from './chart-config';

// Widget palette categories. Grouped by domain (what the widget is about),
// not by chart shape (what it looks like) — so 2D and 3D variants of the
// same data live together. See OMN chat 2026-04-25 for the rationale.
export const COMPONENT_CATEGORIES = ['cost', 'activity', 'quality', 'health'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

/**
 * Declares the canonical ordering authority for rows in a projection.
 * Adapters MUST NOT rely on incidental array order unless this contract is declared.
 *
 * - `ingest_sequence`: rows are ordered by their arrival order in the event log
 * - `bucket_time`: rows are ordered by a time-bucket field (specify via `fieldName`)
 * - `aggregation_key`: rows are ordered by an aggregation key field (specify via `fieldName`)
 * - `monotonic_field`: rows are ordered by an arbitrary monotonically increasing field (specify via `fieldName`)
 */
export interface ProjectionOrderingAuthority {
  authority: 'ingest_sequence' | 'bucket_time' | 'aggregation_key' | 'monotonic_field';
  fieldName?: string;
  direction?: 'asc' | 'desc';
  /** ISO-8601 timezone or semantic clock name, required when authority is 'bucket_time' */
  clockSemantics?: string;
}

export interface GridSize {
  w: number;
  h: number;
}

export interface DataSourceDeclaration {
  type: 'websocket' | 'projection';
  topic?: string;
  required: boolean;
  purpose: 'live_updates' | 'initial_fetch';
  auth_required?: boolean;
}

export interface ComponentEvent {
  name: string;
  schema?: Record<string, unknown>;
}

/**
 * Authority label for a component's rendered data, surfaced in the palette and
 * widget chrome. Mirrors `PanelAuthority` in the delegation control plane.
 *
 * - `projection-backed`: rows come from the standard projection API (`/projection/{topic}`)
 *   and the backing topic returned at least one row at classification time.
 * - `runtime-observed`: data is observed directly from runtime health/topology
 *   surfaces and is not projection proof by itself.
 * - `degraded`: the standard projection API serves the topic but it is empty
 *   or the backing table is unavailable (HTTP 200 with zero rows, or HTTP 503).
 *   The widget renders a truthful degraded/empty state, never synthetic data.
 * - `hidden`: the standard projection API does not serve the topic today
 *   (HTTP 404 - no producer / no `projection_api: expose`). The widget is hidden
 *   from the palette until a real projection backs it.
 */
export const COMPONENT_AUTHORITY_LABELS = ['projection-backed', 'runtime-observed', 'degraded', 'hidden'] as const;
export type ComponentAuthorityLabel = (typeof COMPONENT_AUTHORITY_LABELS)[number];

/**
 * Palette visibility classification (OMN-12833 / A2.5). Derived from a live probe
 * of the single standard projection backend, NOT from whether component code
 * exists. `hidden` components are removed from the widget palette so the demo
 * never exposes a widget that cannot be backed by the one authoritative backend.
 */
export type ComponentPaletteVisibility = 'visible' | 'hidden';

export interface ComponentManifest {
  name: string;
  displayName: string;
  description: string;
  category: ComponentCategory;
  version: string;
  implementationKey: string;
  /**
   * OMN-12833 (A2.5): palette visibility derived from the single standard
   * projection backend. `hidden` keeps the component out of the palette when its
   * topic(s) cannot be served (404) or are degraded and not worth showing.
   * Optional so manifests that predate the field default to `visible`.
   */
  paletteVisibility?: ComponentPaletteVisibility;
  /**
   * OMN-12981: authority label for the component's data source. Required so
   * degraded or hidden panels cannot be mistaken for projection-backed proof.
   */
  authorityLabel: ComponentAuthorityLabel;
  /**
   * JSON schema describing the widget's per-instance config. Omit when the
   * widget has nothing to configure — the kebab "Configure Widget" item is
   * gated on this field being present and having non-empty properties.
   */
  configSchema?: JSONSchema7;
  /**
   * Input contract: the JSON schema (or a $ref string pointing to one) that
   * describes the shape of each row emitted by the upstream projection topic.
   * Adapters receive data pre-validated against this schema. Omit for widgets
   * that do not bind to a projection source.
   *
   * When row order matters for the widget's output, declare an `ordering`
   * property inside this schema using `ProjectionOrderingAuthority`.
   */
  projectionSchema?: JSONSchema7 | string;
  /**
   * Output contract: the JSON schema (or a $ref string pointing to one) that
   * describes what the rendered widget guarantees to display. Used as the basis
   * for Playwright assertions (OMN-7093). Omit for widgets with no verifiable
   * rendered output contract.
   */
  displayContract?: JSONSchema7 | string;
  dataSources: DataSourceDeclaration[];
  events: {
    emits: ComponentEvent[];
    consumes: ComponentEvent[];
  };
  defaultSize: GridSize;
  minSize: GridSize;
  maxSize: GridSize;
  emptyState: {
    message: string;
    hint?: string;
    /**
     * Per-reason messages for widgets that distinguish between empty-state causes.
     * When provided, the adapter renders the matching per-reason message in preference
     * to the top-level `message`. Omit for widgets that do not need distinguished states.
     *
     * Key set mirrors `EmptyStateReason` in chart-config.ts. Notably, `upstream-blocked`
     * MUST be declared for any widget whose projection schema has upstream-blocked columns.
     */
    reasons?: Partial<Record<EmptyStateReason, { message: string; cta?: string }>>;
  };
  capabilities: {
    supports_compare: boolean;
    supports_export: boolean;
    supports_fullscreen: boolean;
    /**
     * Whether the widget participates in the dashboard-level time range
     * filter. `true` for time-series widgets (cost trend, routing
     * decisions, etc.) that can slice their data by a start/end window.
     * `false` for point-in-time snapshots (readiness, baselines) or
     * pre-aggregated summary widgets whose numbers are computed over an
     * opaque window and can't be re-sliced client-side.
     *
     * Optional so existing manifests that predate the field stay valid;
     * consumers should treat `undefined` as `false`.
     */
    supports_time_range?: boolean;
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

function isValidSchemaReference(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  return false;
}

export function validateComponentManifest(m: ComponentManifest): ManifestValidationResult {
  const errors: string[] = [];

  if (!m.name || m.name.trim() === '') errors.push('name is required');
  if (!m.displayName) errors.push('displayName is required');
  if (!m.implementationKey) errors.push('implementationKey is required');
  if (!COMPONENT_CATEGORIES.includes(m.category)) {
    errors.push(`Invalid category "${m.category}". Must be one of: ${COMPONENT_CATEGORIES.join(', ')}`);
  }
  if (!m.authorityLabel) {
    errors.push('authorityLabel is required');
  } else if (!COMPONENT_AUTHORITY_LABELS.includes(m.authorityLabel)) {
    errors.push(`Invalid authorityLabel "${m.authorityLabel}". Must be one of: ${COMPONENT_AUTHORITY_LABELS.join(', ')}`);
  }
  if (m.paletteVisibility !== undefined && m.paletteVisibility !== 'visible' && m.paletteVisibility !== 'hidden') {
    errors.push(`Invalid paletteVisibility "${m.paletteVisibility}". Must be one of: visible, hidden`);
  }
  if (m.paletteVisibility === 'hidden' && m.authorityLabel !== 'hidden') {
    errors.push('hidden components must use authorityLabel "hidden"');
  }
  if (m.authorityLabel === 'hidden' && m.paletteVisibility !== 'hidden') {
    errors.push('authorityLabel "hidden" requires paletteVisibility "hidden"');
  }
  if (m.minSize.w > m.maxSize.w || m.minSize.h > m.maxSize.h) {
    errors.push('minSize cannot exceed maxSize');
  }
  if (m.defaultSize.w < m.minSize.w || m.defaultSize.h < m.minSize.h) {
    errors.push('defaultSize cannot be smaller than minSize');
  }
  if (m.defaultSize.w > m.maxSize.w || m.defaultSize.h > m.maxSize.h) {
    errors.push('defaultSize cannot exceed maxSize');
  }

  if (m.projectionSchema !== undefined && !isValidSchemaReference(m.projectionSchema)) {
    errors.push('projectionSchema must be a JSONSchema7 object or a non-empty $ref string');
  }
  if (m.displayContract !== undefined && !isValidSchemaReference(m.displayContract)) {
    errors.push('displayContract must be a JSONSchema7 object or a non-empty $ref string');
  }

  // T16 (OMN-157): every dataSource must declare its target. Dashboard-v2
  // data comes from projection/event-bus topics, not arbitrary REST APIs.
  for (const [idx, ds] of m.dataSources.entries()) {
    if (ds.type === 'websocket' || ds.type === 'projection') {
      if (!ds.topic || ds.topic.trim() === '') {
        errors.push(`dataSources[${idx}] of type '${ds.type}' must declare a non-empty topic`);
      }
    } else {
      const unsupported = ds as { type?: unknown };
      errors.push(`dataSources[${idx}] has unsupported type '${String(unsupported.type)}'`);
    }
  }

  return { valid: errors.length === 0, errors };
}
