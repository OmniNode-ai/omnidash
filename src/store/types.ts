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

export type AppPage =
  | 'dashboard'
  // OMN-13602 — savings-dashboard drill-down views (additive routes).
  | 'tasks'
  | 'run-detail'
  | 'savings-over-time'
  | 'feature-flags'
  | 'eval'
  // OMN-12943 — ported event-dash views (additive routes). Existing members untouched.
  | 'delegation-evidence'
  | 'event-bus'
  | 'experiments'
  | 'sea-control';

/**
 * Thin params carried alongside `activePage` for drill-down views (OMN-13602):
 * a tier filter when the tasks list is opened from a tier-scoped dashboard figure,
 * a run id when a run is opened, etc. Not URL-synced — see the routing note in the
 * dashboard refactor architecture doc.
 */
export interface PageParams {
  tasksTier?: string;
  runId?: string;
  /** Page to return to from a drill-down (e.g. run-detail back link). */
  from?: AppPage;
}

export interface UISlice {
  /** True when the left dashboard sidebar is collapsed to a narrow rail. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  /** The active top-level page being rendered in the main content area. */
  activePage: AppPage;
  /** Optional params for the active page (cleared when navigating without any). */
  pageParams: PageParams;
  setActivePage: (page: AppPage, params?: PageParams) => void;
  /** The "how is this calculated?" explainer overlay, opened from any savings figure. */
  howCalcOpen: boolean;
  openHowCalc: () => void;
  closeHowCalc: () => void;
}

export type FrameStore = FiltersSlice & UISlice;
