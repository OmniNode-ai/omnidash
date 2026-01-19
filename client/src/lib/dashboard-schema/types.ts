/**
 * Dashboard Schema Types
 *
 * Contract-driven types aligned with omnibase_core models.
 * All types have runtime validation via Zod in validators.ts.
 */

// Enums matching omnibase_core (validated at runtime via Zod)
export enum WidgetType {
  CHART = 'chart',
  TABLE = 'table',
  METRIC_CARD = 'metric_card',
  STATUS_GRID = 'status_grid',
  EVENT_FEED = 'event_feed',
}

export enum DashboardTheme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum DashboardStatus {
  INITIALIZING = 'initializing',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

// Widget Config Types (discriminated by config_kind)
// NOTE: No raw color values - use theme tokens

export interface WidgetConfigChart {
  config_kind: 'chart';
  chart_type: 'line' | 'bar' | 'area' | 'pie' | 'scatter';
  series: ChartSeriesConfig[];
  x_axis?: ChartAxisConfig;
  y_axis?: ChartAxisConfig;
  show_legend?: boolean;
  stacked?: boolean;
}

export interface WidgetConfigTable {
  config_kind: 'table';
  columns: TableColumnConfig[];
  rows_key: string; // Key into DashboardData for row array
  page_size?: number;
  show_pagination?: boolean;
  default_sort_key?: string;
  default_sort_direction?: 'asc' | 'desc';
  striped?: boolean;
  hover_highlight?: boolean;
}

export interface WidgetConfigMetricCard {
  config_kind: 'metric_card';
  metric_key: string; // Key into DashboardData
  label: string;
  unit?: string;
  value_format?: 'number' | 'currency' | 'percent' | 'duration';
  precision?: number;
  show_trend?: boolean;
  trend_key?: string; // Key into DashboardData for comparison
  thresholds?: MetricThreshold[];
  icon?: string;
}

export interface WidgetConfigStatusGrid {
  config_kind: 'status_grid';
  items_key: string; // Key into DashboardData
  id_field: string;
  label_field: string;
  status_field: string;
  columns?: number;
  show_labels?: boolean;
  compact?: boolean;
}

export interface WidgetConfigEventFeed {
  config_kind: 'event_feed';
  events_key: string; // Key into DashboardData
  max_items?: number;
  show_timestamp?: boolean;
  show_source?: boolean;
  show_severity?: boolean;
  group_by_type?: boolean;
  auto_scroll?: boolean;
}

export type WidgetConfig =
  | WidgetConfigChart
  | WidgetConfigTable
  | WidgetConfigMetricCard
  | WidgetConfigStatusGrid
  | WidgetConfigEventFeed;

// Supporting Types
export interface ChartSeriesConfig {
  name: string;
  data_key: string;
  series_type?: 'line' | 'bar' | 'area' | 'scatter';
}

export interface ChartAxisConfig {
  label?: string;
  min_value?: number;
  max_value?: number;
  show_grid?: boolean;
}

export interface TableColumnConfig {
  key: string;
  header: string;
  width?: number;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  format?: string;
}

export interface MetricThreshold {
  value: number;
  severity: 'warning' | 'error' | 'critical'; // Semantic, not raw color
  label?: string;
}

// Widget Definition
export interface WidgetDefinition {
  widget_id: string;
  title: string;
  config: WidgetConfig;
  row: number;
  col: number;
  width: number;
  height: number;
  description?: string;
}

// Layout Configuration
export interface DashboardLayoutConfig {
  columns: number;
  row_height: number;
  gap: number;
  responsive?: boolean;
}

// Top-Level Dashboard Configuration
export interface DashboardConfig {
  dashboard_id: string;
  name: string;
  description?: string;
  layout: DashboardLayoutConfig;
  widgets: WidgetDefinition[];
  data_source: string; // Single data source for entire dashboard
  refresh_interval_seconds?: number;
  theme?: DashboardTheme;
  initial_status?: DashboardStatus;
}

// Dashboard Data (fetched once, widgets select from this)
export type DashboardData = Record<string, unknown>;
