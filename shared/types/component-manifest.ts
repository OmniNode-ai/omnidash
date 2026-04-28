import type { JSONSchema7 } from 'json-schema';

// Widget palette categories. Grouped by domain (what the widget is about),
// not by chart shape (what it looks like) — so 2D and 3D variants of the
// same data live together. See OMN chat 2026-04-25 for the rationale.
export const COMPONENT_CATEGORIES = ['cost', 'activity', 'quality', 'health'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

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

export interface ComponentManifest {
  name: string;
  displayName: string;
  description: string;
  category: ComponentCategory;
  version: string;
  implementationKey: string;
  /**
   * JSON schema describing the widget's per-instance config. Omit when the
   * widget has nothing to configure — the kebab "Configure Widget" item is
   * gated on this field being present and having non-empty properties.
   */
  configSchema?: JSONSchema7;
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

export function validateComponentManifest(m: ComponentManifest): ManifestValidationResult {
  const errors: string[] = [];

  if (!m.name || m.name.trim() === '') errors.push('name is required');
  if (!m.displayName) errors.push('displayName is required');
  if (!m.implementationKey) errors.push('implementationKey is required');
  if (!COMPONENT_CATEGORIES.includes(m.category)) {
    errors.push(`Invalid category "${m.category}". Must be one of: ${COMPONENT_CATEGORIES.join(', ')}`);
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
