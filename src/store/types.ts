export interface TimeRange {
  start: string;
  end: string;
  /**
   * Optional human-readable label set when the range came from a preset
   * (e.g. "Last 24h"). Used by the UI selector for a compact display
   * instead of formatting the absolute timestamps. Absent for ranges
   * entered as a custom start/end.
   */
  label?: string;
}

export interface GlobalFilters {
  timeRange?: TimeRange;
  repo?: string;
  author?: string;
  /**
   * Dashboard-level auto-refresh interval in milliseconds. `null`
   * means the user explicitly disabled auto-refresh. `undefined`
   * means "no global preference set" — `useProjectionQuery` falls
   * back to its widget-supplied `refetchInterval`. A `number` value
   * overrides whatever the widget supplied.
   *
   * Wired by OMN-126: `AutoRefreshSelector` writes here,
   * `useProjectionQuery` reads it and resolves the final
   * `refetchInterval` for every projection query.
   */
  autoRefreshInterval?: number | null;
  /**
   * Dashboard-level timezone for rendering timestamps and bucket
   * labels. `undefined` means "browser local" — every widget's
   * `toLocaleString*` call renders without an explicit `timeZone`
   * option, deferring to the browser. A non-empty string is an
   * IANA zone identifier (e.g. `'UTC'`, `'America/New_York'`) that
   * widgets pass through as `{ timeZone: ... }`.
   *
   * Wired by OMN-125: `TimezoneSelector` writes here, `useTimezone`
   * reads it, and time-rendering widgets thread the zone into
   * their existing date-formatting calls.
   */
  timezone?: string;
}

export interface EditModeSlice {
  editMode: boolean;
  setEditMode: (value: boolean) => void;
}

/**
 * Subset of `GlobalFilters` keys that are simple string values and
 * therefore manipulated through the generic `setFilter(key, value)`
 * setter. `timeRange`, `autoRefreshInterval`, and `timezone` each
 * have their own typed setter and are excluded from this union.
 */
export type ScalarFilterKey = Exclude<keyof GlobalFilters, 'timeRange' | 'autoRefreshInterval' | 'timezone'>;

export interface FiltersSlice {
  globalFilters: GlobalFilters;
  setTimeRange: (range: TimeRange | undefined) => void;
  setFilter: (key: ScalarFilterKey, value: string | undefined) => void;
  /** OMN-126: set the dashboard-level auto-refresh interval. */
  setAutoRefreshInterval: (interval: number | null) => void;
  /** OMN-125: set the dashboard-level timezone (IANA name) or undefined to revert to browser local. */
  setTimezone: (timezone: string | undefined) => void;
  clearFilters: () => void;
}

import type { DashboardDefinition, DashboardLayoutItem } from '@shared/types/dashboard';
import type { GridSize } from '@shared/types/component-manifest';

export interface DashboardSlice {
  // Multi-dashboard list (OMN-43)
  dashboards: DashboardDefinition[];
  activeDashboardId: string | null;
  // Derived accessor — reads dashboards.find(d => d.id === activeDashboardId)
  activeDashboard: DashboardDefinition | null;

  // List-level actions
  createDashboard: (name: string) => DashboardDefinition;
  renameDashboard: (id: string, newName: string) => void;
  deleteDashboard: (id: string) => void;
  /** Clone a dashboard (all layout items copied, fresh id, "(copy)" name suffix). Returns the copy or null if source is missing. */
  duplicateDashboard: (id: string) => DashboardDefinition | null;
  setActiveDashboardById: (id: string) => void;

  // Legacy setter — kept for backward compat with OMN-38/41 tests
  setActiveDashboard: (dashboard: DashboardDefinition | null) => void;

  // Layout-level actions
  addComponentToLayout: (componentName: string, componentVersion: string, defaultSize: GridSize) => void;
  /** Insert a new placement at the given index. Out-of-range `atIndex` is clamped to [0, length]. */
  insertComponentAt: (componentName: string, componentVersion: string, defaultSize: GridSize, atIndex: number) => void;
  removeComponentFromLayout: (itemId: string) => void;
  /** Clone a placement (same component + config, new id). New copy appended to layout. */
  duplicateLayoutItem: (itemId: string) => void;
  /** Reorder an existing placement to a new index in the layout. No-op if itemId is not found. */
  moveLayoutItem: (itemId: string, toIndex: number) => void;
  updateLayout: (layout: DashboardLayoutItem[]) => void;
  updateComponentConfig: (itemId: string, config: Record<string, unknown>) => void;
}

import type { ConversationSlice } from './conversationSlice';
export type { ConversationSlice };

import type { ConfigSlice } from './configSlice';
export type { ConfigSlice };

export type FrameStore = EditModeSlice & FiltersSlice & DashboardSlice & ConversationSlice & ConfigSlice;
