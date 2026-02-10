/**
 * Dashboard Schema Validators
 *
 * Zod runtime validators for dashboard configuration.
 * Validates configs at load time to crash fast with helpful errors.
 */

import { z } from 'zod';
import type { DashboardConfig } from './types';

// Enums
export const widgetTypeSchema = z.enum([
  'chart',
  'table',
  'metric_card',
  'status_grid',
  'event_feed',
]);
export const dashboardThemeSchema = z.enum(['light', 'dark', 'system']);
export const dashboardStatusSchema = z.enum(['initializing', 'connected', 'disconnected', 'error']);
export const chartTypeSchema = z.enum(['line', 'bar', 'area', 'pie', 'donut', 'scatter']);

// Schema defaults - exported for consumers who need to reference them
/** Default max items before aggregating to "Other" in chart widgets */
export const CHART_MAX_ITEMS_DEFAULT = 7;

// Supporting schemas
export const chartSeriesConfigSchema = z.object({
  name: z.string().min(1),
  data_key: z.string().min(1),
  series_type: z.enum(['line', 'bar', 'area', 'scatter']).optional(),
});

export const chartAxisConfigSchema = z.object({
  label: z.string().optional(),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
  show_grid: z.boolean().optional(),
});

export const tableColumnConfigSchema = z.object({
  key: z.string().min(1),
  header: z.string().min(1),
  width: z.number().int().positive().optional(),
  sortable: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  format: z.string().optional(),
});

export const metricThresholdSchema = z.object({
  value: z.number(),
  severity: z.enum(['warning', 'error', 'critical']),
  label: z.string().optional(),
});

// Widget Config Schemas (discriminated union)
export const widgetConfigChartSchema = z.object({
  config_kind: z.literal('chart'),
  chart_type: chartTypeSchema,
  data_key: z.string().min(1).optional(),
  series: z.array(chartSeriesConfigSchema).min(1),
  x_axis: chartAxisConfigSchema.optional(),
  y_axis: chartAxisConfigSchema.optional(),
  show_legend: z.boolean().optional(),
  stacked: z.boolean().optional(),
  alternate_chart_type: chartTypeSchema.optional(),
  max_items: z.number().int().min(1).default(CHART_MAX_ITEMS_DEFAULT).optional(),
});

export const widgetConfigTableSchema = z.object({
  config_kind: z.literal('table'),
  columns: z.array(tableColumnConfigSchema).min(1),
  rows_key: z.string().min(1),
  page_size: z.number().int().positive().optional(),
  show_pagination: z.boolean().optional(),
  default_sort_key: z.string().optional(),
  default_sort_direction: z.enum(['asc', 'desc']).optional(),
  striped: z.boolean().optional(),
  hover_highlight: z.boolean().optional(),
  clickable: z.boolean().optional(),
});

export const widgetConfigMetricCardSchema = z.object({
  config_kind: z.literal('metric_card'),
  metric_key: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().optional(),
  value_format: z.enum(['number', 'currency', 'percent', 'duration']).optional(),
  precision: z.number().int().min(0).max(10).optional(),
  show_trend: z.boolean().optional(),
  trend_key: z.string().optional(),
  thresholds: z.array(metricThresholdSchema).optional(),
  icon: z.string().optional(),
  semantic_status: z.enum(['healthy', 'warning', 'error', 'neutral']).optional(),
});

export const widgetConfigStatusGridSchema = z.object({
  config_kind: z.literal('status_grid'),
  items_key: z.string().min(1),
  id_field: z.string().min(1),
  label_field: z.string().min(1),
  status_field: z.string().min(1),
  columns: z.number().int().positive().optional(),
  show_labels: z.boolean().optional(),
  compact: z.boolean().optional(),
});

export const widgetConfigEventFeedSchema = z.object({
  config_kind: z.literal('event_feed'),
  events_key: z.string().min(1),
  max_items: z.number().int().positive().optional(),
  show_timestamp: z.boolean().optional(),
  show_source: z.boolean().optional(),
  show_severity: z.boolean().optional(),
  group_by_type: z.boolean().optional(),
  auto_scroll: z.boolean().optional(),
});

export const widgetConfigSchema = z
  .discriminatedUnion('config_kind', [
    widgetConfigMetricCardSchema,
    widgetConfigTableSchema,
    widgetConfigChartSchema,
    widgetConfigStatusGridSchema,
    widgetConfigEventFeedSchema,
  ])
  .refine(
    (data) => {
      if (data.config_kind !== 'chart') return true;
      return !data.alternate_chart_type || data.alternate_chart_type !== data.chart_type;
    },
    {
      message: 'alternate_chart_type must differ from chart_type when specified',
      path: ['config', 'alternate_chart_type'],
    }
  );

/**
 * Widget Definition Schema
 *
 * Aligned with omnibase_core/models/dashboard/ModelWidgetDefinition.
 * Validates widget configuration at runtime for crash-fast behavior.
 *
 * @see omnibase_core/models/dashboard/model_widget_definition.py
 */
export const widgetDefinitionSchema = z
  .object({
    widget_id: z.string().min(1),
    title: z.string().min(1),
    config: widgetConfigSchema,
    row: z.number().int().min(0),
    col: z.number().int().min(0),
    width: z.number().int().min(1).max(12), // Matches omnibase_core: ge=1, le=12
    height: z.number().int().min(1), // Matches omnibase_core: ge=1
    description: z.string().optional(),
    // Aligned with omnibase_core ModelWidgetDefinition.data_source
    data_source: z.string().optional(),
    // Aligned with omnibase_core ModelWidgetDefinition.extra_config (Mapping[str, str])
    extra_config: z.record(z.string(), z.string()).optional(),
  })
  .strict();

export const dashboardLayoutSchema = z.object({
  columns: z.number().int().min(1).max(24).default(12),
  row_height: z.number().int().min(50).default(100),
  gap: z.number().int().min(0).default(16),
  responsive: z.boolean().optional(),
});

// ============================================================================
// Runtime Configuration Schemas
// ============================================================================

// Defaults exported for consumers who need to reference them
/** Default max events to retain in memory */
export const EVENT_MONITORING_MAX_EVENTS_DEFAULT = 50;
/** Default options for max events dropdown */
export const EVENT_MONITORING_MAX_EVENTS_OPTIONS_DEFAULT = [50, 100, 200, 500, 1000];
/** Default throughput cleanup interval (events between cleanups) */
export const EVENT_MONITORING_THROUGHPUT_CLEANUP_INTERVAL_DEFAULT = 100;
/** Default unified monitoring window in ms (5 minutes) */
export const EVENT_MONITORING_MONITORING_WINDOW_MS_DEFAULT = 300000;
/** Default staleness threshold in ms (10 minutes) */
export const EVENT_MONITORING_STALENESS_THRESHOLD_MS_DEFAULT = 600000;
/** Default max breakdown items before pruning */
export const EVENT_MONITORING_MAX_BREAKDOWN_ITEMS_DEFAULT = 50;
/** Default periodic cleanup interval in ms (10 seconds) */
export const EVENT_MONITORING_PERIODIC_CLEANUP_INTERVAL_MS_DEFAULT = 10000;

// Burst / Spike Detection defaults
/** Default burst detection window in ms (30 seconds) */
export const EVENT_MONITORING_BURST_WINDOW_MS_DEFAULT = 30000;
/** Default burst throughput multiplier (3x baseline) */
export const EVENT_MONITORING_BURST_THROUGHPUT_MULTIPLIER_DEFAULT = 3;
/** Default minimum absolute rate (events/sec) to trigger burst */
export const EVENT_MONITORING_BURST_THROUGHPUT_MIN_RATE_DEFAULT = 5;
/** Default burst error multiplier (2x baseline) */
export const EVENT_MONITORING_BURST_ERROR_MULTIPLIER_DEFAULT = 2;
/** Default absolute error rate threshold (%) */
export const EVENT_MONITORING_BURST_ERROR_ABSOLUTE_THRESHOLD_DEFAULT = 5;
/** Default minimum events in burst window for meaningful error rate */
export const EVENT_MONITORING_BURST_ERROR_MIN_EVENTS_DEFAULT = 50;
/** Default burst cooldown in ms (15 seconds) */
export const EVENT_MONITORING_BURST_COOLDOWN_MS_DEFAULT = 15000;

/**
 * Event Monitoring Configuration Schema
 *
 * Validates runtime settings for the Event Bus Monitor dashboard.
 * All fields have sensible defaults for typical usage patterns.
 */
export const eventMonitoringConfigSchema = z
  .object({
    /** Maximum events to retain in memory (10-10000) */
    max_events: z.number().int().min(10).max(10000).default(EVENT_MONITORING_MAX_EVENTS_DEFAULT),

    /** Available options for max events dropdown */
    max_events_options: z
      .array(z.number().int().positive())
      .min(1)
      .default(EVENT_MONITORING_MAX_EVENTS_OPTIONS_DEFAULT),

    /** Events between throughput cleanups (min 10) */
    throughput_cleanup_interval: z
      .number()
      .int()
      .min(10)
      .default(EVENT_MONITORING_THROUGHPUT_CLEANUP_INTERVAL_DEFAULT),

    /** Unified monitoring window in ms (min 30 seconds, default 5 minutes) */
    monitoring_window_ms: z
      .number()
      .int()
      .min(30000)
      .default(EVENT_MONITORING_MONITORING_WINDOW_MS_DEFAULT),

    /** Staleness threshold in ms (min 1 minute, default 10 minutes) */
    staleness_threshold_ms: z
      .number()
      .int()
      .min(60000)
      .default(EVENT_MONITORING_STALENESS_THRESHOLD_MS_DEFAULT),

    /** Maximum breakdown items before pruning (min 5) */
    max_breakdown_items: z
      .number()
      .int()
      .min(5)
      .default(EVENT_MONITORING_MAX_BREAKDOWN_ITEMS_DEFAULT),

    /** Periodic cleanup interval in ms (min 1 second, default 10 seconds) */
    periodic_cleanup_interval_ms: z
      .number()
      .int()
      .min(1000)
      .default(EVENT_MONITORING_PERIODIC_CLEANUP_INTERVAL_MS_DEFAULT),

    /** Burst detection window in ms (min 5 seconds, default 30 seconds) */
    burst_window_ms: z.number().int().min(5000).default(EVENT_MONITORING_BURST_WINDOW_MS_DEFAULT),

    /** Throughput burst multiplier (min 1.5) */
    burst_throughput_multiplier: z
      .number()
      .min(1.5)
      .default(EVENT_MONITORING_BURST_THROUGHPUT_MULTIPLIER_DEFAULT),

    /** Minimum absolute events/sec for throughput burst (min 1) */
    burst_throughput_min_rate: z
      .number()
      .min(1)
      .default(EVENT_MONITORING_BURST_THROUGHPUT_MIN_RATE_DEFAULT),

    /** Error spike multiplier (min 1.5) */
    burst_error_multiplier: z
      .number()
      .min(1.5)
      .default(EVENT_MONITORING_BURST_ERROR_MULTIPLIER_DEFAULT),

    /** Absolute error rate threshold in % (min 1) */
    burst_error_absolute_threshold: z
      .number()
      .min(1)
      .default(EVENT_MONITORING_BURST_ERROR_ABSOLUTE_THRESHOLD_DEFAULT),

    /** Minimum events in burst window for error rate (min 5) */
    burst_error_min_events: z
      .number()
      .int()
      .min(5)
      .default(EVENT_MONITORING_BURST_ERROR_MIN_EVENTS_DEFAULT),

    /** Burst cooldown in ms (min 1 second, default 15 seconds) */
    burst_cooldown_ms: z
      .number()
      .int()
      .min(1000)
      .default(EVENT_MONITORING_BURST_COOLDOWN_MS_DEFAULT),
  })
  .refine((data) => data.burst_window_ms < data.monitoring_window_ms, {
    message:
      'burst_window_ms must be less than monitoring_window_ms for meaningful burst detection',
    path: ['burst_window_ms'],
  });

/**
 * Dashboard Runtime Configuration Schema
 *
 * Container schema for dashboard-specific runtime settings.
 * All sub-configurations are optional to allow partial configuration.
 */
export const dashboardRuntimeConfigSchema = z.object({
  /** Event monitoring specific settings */
  event_monitoring: eventMonitoringConfigSchema.optional(),
});

// ============================================================================
// Topic Metadata Schema (for Event Bus dashboards)
// ============================================================================

/**
 * Topic Metadata Schema
 *
 * Validates metadata for a Kafka/event bus topic.
 * Used to provide human-readable labels and categorization.
 */
export const topicMetadataSchema = z.object({
  /** Human-readable display label for the topic */
  label: z.string().min(1),
  /** Description explaining what events this topic carries */
  description: z.string().min(1),
  /** Category for grouping topics (e.g., 'routing', 'lifecycle', 'health', 'actions') */
  category: z.string().min(1),
});

export const dashboardConfigSchema = z
  .object({
    dashboard_id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    layout: dashboardLayoutSchema,
    widgets: z.array(widgetDefinitionSchema),
    data_source: z.string().min(1),
    refresh_interval_seconds: z.number().int().min(1).optional(),
    theme: dashboardThemeSchema.optional(),
    initial_status: dashboardStatusSchema.optional(),
    /** Optional runtime configuration for dashboard-specific settings */
    runtime_config: dashboardRuntimeConfigSchema.optional(),
    /** Topic metadata mapping for event bus dashboards */
    topic_metadata: z.record(z.string(), topicMetadataSchema).optional(),
    /** List of Kafka topics monitored by this dashboard */
    monitored_topics: z.array(z.string().min(1)).optional(),
  })
  .strict();

/**
 * Validate a dashboard config at runtime.
 * Throws ZodError if invalid - crash fast with helpful errors.
 */
export function validateDashboardConfig(config: unknown): DashboardConfig {
  return dashboardConfigSchema.parse(config) as DashboardConfig;
}

/**
 * Safely validate a dashboard config without throwing.
 * Returns { success: true, data } or { success: false, error }.
 */
export function safeParseDashboardConfig(config: unknown) {
  return dashboardConfigSchema.safeParse(config);
}
