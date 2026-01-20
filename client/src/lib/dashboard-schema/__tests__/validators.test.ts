import { describe, it, expect } from 'vitest';
import {
  validateDashboardConfig,
  safeParseDashboardConfig,
  dashboardConfigSchema,
  widgetDefinitionSchema,
  widgetConfigSchema,
  widgetConfigChartSchema,
  widgetConfigTableSchema,
  widgetConfigMetricCardSchema,
  widgetConfigStatusGridSchema,
  widgetConfigEventFeedSchema,
  dashboardLayoutSchema,
  chartSeriesConfigSchema,
  tableColumnConfigSchema,
  metricThresholdSchema,
} from '../validators';

// Test fixtures
const validChartConfig = {
  config_kind: 'chart' as const,
  chart_type: 'line' as const,
  series: [{ name: 'Requests', data_key: 'requests_per_second' }],
  show_legend: true,
};

const validTableConfig = {
  config_kind: 'table' as const,
  columns: [
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status' },
  ],
  rows_key: 'agents',
  page_size: 10,
};

const validMetricCardConfig = {
  config_kind: 'metric_card' as const,
  metric_key: 'active_agents',
  label: 'Active Agents',
  value_format: 'number' as const,
};

const validStatusGridConfig = {
  config_kind: 'status_grid' as const,
  items_key: 'services',
  id_field: 'id',
  label_field: 'name',
  status_field: 'status',
};

const validEventFeedConfig = {
  config_kind: 'event_feed' as const,
  events_key: 'recent_events',
  max_items: 50,
  show_timestamp: true,
};

const validWidgetDefinition = {
  widget_id: 'widget-1',
  title: 'Test Widget',
  config: validMetricCardConfig,
  row: 0,
  col: 0,
  width: 3,
  height: 2,
};

const validLayout = {
  columns: 12,
  row_height: 100,
  gap: 16,
};

const validDashboardConfig = {
  dashboard_id: 'dashboard-1',
  name: 'Test Dashboard',
  description: 'A test dashboard',
  layout: validLayout,
  widgets: [validWidgetDefinition],
  data_source: '/api/dashboard/test',
  refresh_interval_seconds: 30,
  theme: 'dark' as const,
};

describe('Dashboard Schema Validators', () => {
  describe('dashboardConfigSchema', () => {
    it('should validate a valid dashboard config', () => {
      const result = dashboardConfigSchema.safeParse(validDashboardConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dashboard_id).toBe('dashboard-1');
        expect(result.data.name).toBe('Test Dashboard');
        expect(result.data.widgets).toHaveLength(1);
      }
    });

    it('should validate dashboard config without optional fields', () => {
      const minimalConfig = {
        dashboard_id: 'minimal-dashboard',
        name: 'Minimal Dashboard',
        layout: validLayout,
        widgets: [],
        data_source: '/api/data',
      };

      const result = dashboardConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
    });

    it('should reject dashboard config with empty dashboard_id', () => {
      const invalidConfig = {
        ...validDashboardConfig,
        dashboard_id: '',
      };

      const result = dashboardConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject dashboard config with empty name', () => {
      const invalidConfig = {
        ...validDashboardConfig,
        name: '',
      };

      const result = dashboardConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject dashboard config with missing required fields', () => {
      const invalidConfig = {
        dashboard_id: 'test',
        // missing name, layout, widgets, data_source
      };

      const result = dashboardConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject dashboard config with invalid theme', () => {
      const invalidConfig = {
        ...validDashboardConfig,
        theme: 'invalid-theme',
      };

      const result = dashboardConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject dashboard config with negative refresh_interval_seconds', () => {
      const invalidConfig = {
        ...validDashboardConfig,
        refresh_interval_seconds: -1,
      };

      const result = dashboardConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate all valid theme values', () => {
      for (const theme of ['light', 'dark', 'system']) {
        const config = { ...validDashboardConfig, theme };
        const result = dashboardConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all valid initial_status values', () => {
      for (const status of ['initializing', 'connected', 'disconnected', 'error']) {
        const config = { ...validDashboardConfig, initial_status: status };
        const result = dashboardConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('validateDashboardConfig function', () => {
    it('should return parsed config for valid input', () => {
      const result = validateDashboardConfig(validDashboardConfig);
      expect(result.dashboard_id).toBe('dashboard-1');
      expect(result.name).toBe('Test Dashboard');
    });

    it('should throw ZodError for invalid input', () => {
      const invalidConfig = { dashboard_id: '' };
      expect(() => validateDashboardConfig(invalidConfig)).toThrow();
    });
  });

  describe('safeParseDashboardConfig function', () => {
    it('should return success for valid config', () => {
      const result = safeParseDashboardConfig(validDashboardConfig);
      expect(result.success).toBe(true);
    });

    it('should return error for invalid config without throwing', () => {
      const invalidConfig = { dashboard_id: '' };
      const result = safeParseDashboardConfig(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('dashboardLayoutSchema', () => {
    it('should validate valid layout config', () => {
      const result = dashboardLayoutSchema.safeParse(validLayout);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for missing optional fields', () => {
      const minimalLayout = {};
      const result = dashboardLayoutSchema.safeParse(minimalLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.columns).toBe(12);
        expect(result.data.row_height).toBe(100);
        expect(result.data.gap).toBe(16);
      }
    });

    it('should reject columns exceeding maximum (24)', () => {
      const invalidLayout = { ...validLayout, columns: 25 };
      const result = dashboardLayoutSchema.safeParse(invalidLayout);
      expect(result.success).toBe(false);
    });

    it('should reject columns below minimum (1)', () => {
      const invalidLayout = { ...validLayout, columns: 0 };
      const result = dashboardLayoutSchema.safeParse(invalidLayout);
      expect(result.success).toBe(false);
    });

    it('should reject row_height below minimum (50)', () => {
      const invalidLayout = { ...validLayout, row_height: 49 };
      const result = dashboardLayoutSchema.safeParse(invalidLayout);
      expect(result.success).toBe(false);
    });

    it('should reject negative gap', () => {
      const invalidLayout = { ...validLayout, gap: -1 };
      const result = dashboardLayoutSchema.safeParse(invalidLayout);
      expect(result.success).toBe(false);
    });
  });

  describe('widgetDefinitionSchema', () => {
    it('should validate valid widget definition', () => {
      const result = widgetDefinitionSchema.safeParse(validWidgetDefinition);
      expect(result.success).toBe(true);
    });

    it('should reject widget with empty widget_id', () => {
      const invalidWidget = { ...validWidgetDefinition, widget_id: '' };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should reject widget with empty title', () => {
      const invalidWidget = { ...validWidgetDefinition, title: '' };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should reject widget with negative row', () => {
      const invalidWidget = { ...validWidgetDefinition, row: -1 };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should reject widget with negative col', () => {
      const invalidWidget = { ...validWidgetDefinition, col: -1 };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should reject widget with width less than 1', () => {
      const invalidWidget = { ...validWidgetDefinition, width: 0 };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should reject widget with width exceeding maximum (12)', () => {
      const invalidWidget = { ...validWidgetDefinition, width: 13 };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should reject widget with height less than 1', () => {
      const invalidWidget = { ...validWidgetDefinition, height: 0 };
      const result = widgetDefinitionSchema.safeParse(invalidWidget);
      expect(result.success).toBe(false);
    });

    it('should validate widget with optional description', () => {
      const widget = { ...validWidgetDefinition, description: 'A test widget' };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should validate widget with optional data_source field', () => {
      const widget = {
        ...validWidgetDefinition,
        data_source: 'custom-source',
      };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data_source).toBe('custom-source');
      }
    });

    it('should validate widget with optional extra_config field', () => {
      const widget = {
        ...validWidgetDefinition,
        extra_config: { 'custom-key': 'custom-value', theme: 'compact' },
      };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.extra_config).toEqual({
          'custom-key': 'custom-value',
          theme: 'compact',
        });
      }
    });

    it('should validate widget with both data_source and extra_config', () => {
      const widget = {
        ...validWidgetDefinition,
        data_source: '/api/custom/endpoint',
        extra_config: { refresh_rate: '5000' },
      };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should reject widget with extra_config containing non-string values', () => {
      const widget = {
        ...validWidgetDefinition,
        extra_config: { numeric_value: 123 as unknown as string },
      };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(false);
    });

    it('should validate widget with empty extra_config object', () => {
      const widget = {
        ...validWidgetDefinition,
        extra_config: {},
      };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should validate widget at maximum width boundary (12)', () => {
      const widget = { ...validWidgetDefinition, width: 12 };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });

    it('should validate widget at minimum width boundary (1)', () => {
      const widget = { ...validWidgetDefinition, width: 1 };
      const result = widgetDefinitionSchema.safeParse(widget);
      expect(result.success).toBe(true);
    });
  });

  describe('widgetConfigSchema (discriminated union)', () => {
    it('should validate chart config', () => {
      const result = widgetConfigSchema.safeParse(validChartConfig);
      expect(result.success).toBe(true);
    });

    it('should validate table config', () => {
      const result = widgetConfigSchema.safeParse(validTableConfig);
      expect(result.success).toBe(true);
    });

    it('should validate metric_card config', () => {
      const result = widgetConfigSchema.safeParse(validMetricCardConfig);
      expect(result.success).toBe(true);
    });

    it('should validate status_grid config', () => {
      const result = widgetConfigSchema.safeParse(validStatusGridConfig);
      expect(result.success).toBe(true);
    });

    it('should validate event_feed config', () => {
      const result = widgetConfigSchema.safeParse(validEventFeedConfig);
      expect(result.success).toBe(true);
    });

    it('should reject config with invalid config_kind', () => {
      const invalidConfig = {
        config_kind: 'invalid_type',
        metric_key: 'test',
      };
      const result = widgetConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject config with missing config_kind', () => {
      const invalidConfig = {
        metric_key: 'test',
        label: 'Test',
      };
      const result = widgetConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('widgetConfigChartSchema', () => {
    it('should validate valid chart config', () => {
      const result = widgetConfigChartSchema.safeParse(validChartConfig);
      expect(result.success).toBe(true);
    });

    it('should validate all chart types', () => {
      for (const chartType of ['line', 'bar', 'area', 'pie', 'scatter']) {
        const config = { ...validChartConfig, chart_type: chartType };
        const result = widgetConfigChartSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should reject chart with invalid chart_type', () => {
      const invalidConfig = { ...validChartConfig, chart_type: 'invalid' };
      const result = widgetConfigChartSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject chart with empty series array', () => {
      const invalidConfig = { ...validChartConfig, series: [] };
      const result = widgetConfigChartSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate chart with axis configuration', () => {
      const config = {
        ...validChartConfig,
        x_axis: { label: 'Time', show_grid: true },
        y_axis: { label: 'Count', min_value: 0, max_value: 100 },
      };
      const result = widgetConfigChartSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate chart with stacked option', () => {
      const config = { ...validChartConfig, stacked: true };
      const result = widgetConfigChartSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('widgetConfigTableSchema', () => {
    it('should validate valid table config', () => {
      const result = widgetConfigTableSchema.safeParse(validTableConfig);
      expect(result.success).toBe(true);
    });

    it('should reject table with empty columns array', () => {
      const invalidConfig = { ...validTableConfig, columns: [] };
      const result = widgetConfigTableSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject table with empty rows_key', () => {
      const invalidConfig = { ...validTableConfig, rows_key: '' };
      const result = widgetConfigTableSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate table with sort options', () => {
      const config = {
        ...validTableConfig,
        default_sort_key: 'name',
        default_sort_direction: 'asc' as const,
      };
      const result = widgetConfigTableSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate table with display options', () => {
      const config = {
        ...validTableConfig,
        striped: true,
        hover_highlight: true,
        show_pagination: true,
      };
      const result = widgetConfigTableSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject table with invalid sort direction', () => {
      const invalidConfig = {
        ...validTableConfig,
        default_sort_direction: 'invalid',
      };
      const result = widgetConfigTableSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('widgetConfigMetricCardSchema', () => {
    it('should validate valid metric card config', () => {
      const result = widgetConfigMetricCardSchema.safeParse(validMetricCardConfig);
      expect(result.success).toBe(true);
    });

    it('should reject metric card with empty metric_key', () => {
      const invalidConfig = { ...validMetricCardConfig, metric_key: '' };
      const result = widgetConfigMetricCardSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject metric card with empty label', () => {
      const invalidConfig = { ...validMetricCardConfig, label: '' };
      const result = widgetConfigMetricCardSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate all value_format options', () => {
      for (const format of ['number', 'currency', 'percent', 'duration']) {
        const config = { ...validMetricCardConfig, value_format: format };
        const result = widgetConfigMetricCardSchema.safeParse(config);
        expect(result.success).toBe(true);
      }
    });

    it('should validate metric card with thresholds', () => {
      const config = {
        ...validMetricCardConfig,
        thresholds: [
          { value: 50, severity: 'warning' as const },
          { value: 80, severity: 'error' as const },
          { value: 95, severity: 'critical' as const, label: 'Very High' },
        ],
      };
      const result = widgetConfigMetricCardSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate metric card with trend options', () => {
      const config = {
        ...validMetricCardConfig,
        show_trend: true,
        trend_key: 'previous_active_agents',
      };
      const result = widgetConfigMetricCardSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject metric card with precision out of range', () => {
      const invalidConfig = { ...validMetricCardConfig, precision: 11 };
      const result = widgetConfigMetricCardSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject metric card with negative precision', () => {
      const invalidConfig = { ...validMetricCardConfig, precision: -1 };
      const result = widgetConfigMetricCardSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('widgetConfigStatusGridSchema', () => {
    it('should validate valid status grid config', () => {
      const result = widgetConfigStatusGridSchema.safeParse(validStatusGridConfig);
      expect(result.success).toBe(true);
    });

    it('should reject status grid with empty items_key', () => {
      const invalidConfig = { ...validStatusGridConfig, items_key: '' };
      const result = widgetConfigStatusGridSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject status grid with empty id_field', () => {
      const invalidConfig = { ...validStatusGridConfig, id_field: '' };
      const result = widgetConfigStatusGridSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject status grid with empty label_field', () => {
      const invalidConfig = { ...validStatusGridConfig, label_field: '' };
      const result = widgetConfigStatusGridSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject status grid with empty status_field', () => {
      const invalidConfig = { ...validStatusGridConfig, status_field: '' };
      const result = widgetConfigStatusGridSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate status grid with display options', () => {
      const config = {
        ...validStatusGridConfig,
        columns: 4,
        show_labels: true,
        compact: false,
      };
      const result = widgetConfigStatusGridSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject status grid with non-positive columns', () => {
      const invalidConfig = { ...validStatusGridConfig, columns: 0 };
      const result = widgetConfigStatusGridSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('widgetConfigEventFeedSchema', () => {
    it('should validate valid event feed config', () => {
      const result = widgetConfigEventFeedSchema.safeParse(validEventFeedConfig);
      expect(result.success).toBe(true);
    });

    it('should reject event feed with empty events_key', () => {
      const invalidConfig = { ...validEventFeedConfig, events_key: '' };
      const result = widgetConfigEventFeedSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should validate event feed with all display options', () => {
      const config = {
        ...validEventFeedConfig,
        show_timestamp: true,
        show_source: true,
        show_severity: true,
        group_by_type: true,
        auto_scroll: true,
      };
      const result = widgetConfigEventFeedSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject event feed with non-positive max_items', () => {
      const invalidConfig = { ...validEventFeedConfig, max_items: 0 };
      const result = widgetConfigEventFeedSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe('Supporting schemas', () => {
    describe('chartSeriesConfigSchema', () => {
      it('should validate valid series config', () => {
        const series = { name: 'Series 1', data_key: 'data.series1' };
        const result = chartSeriesConfigSchema.safeParse(series);
        expect(result.success).toBe(true);
      });

      it('should reject series with empty name', () => {
        const series = { name: '', data_key: 'data.series1' };
        const result = chartSeriesConfigSchema.safeParse(series);
        expect(result.success).toBe(false);
      });

      it('should reject series with empty data_key', () => {
        const series = { name: 'Series 1', data_key: '' };
        const result = chartSeriesConfigSchema.safeParse(series);
        expect(result.success).toBe(false);
      });

      it('should validate series with optional series_type', () => {
        const series = { name: 'Series 1', data_key: 'data.series1', series_type: 'bar' as const };
        const result = chartSeriesConfigSchema.safeParse(series);
        expect(result.success).toBe(true);
      });
    });

    describe('tableColumnConfigSchema', () => {
      it('should validate valid column config', () => {
        const column = { key: 'name', header: 'Name' };
        const result = tableColumnConfigSchema.safeParse(column);
        expect(result.success).toBe(true);
      });

      it('should reject column with empty key', () => {
        const column = { key: '', header: 'Name' };
        const result = tableColumnConfigSchema.safeParse(column);
        expect(result.success).toBe(false);
      });

      it('should reject column with empty header', () => {
        const column = { key: 'name', header: '' };
        const result = tableColumnConfigSchema.safeParse(column);
        expect(result.success).toBe(false);
      });

      it('should validate column with all optional fields', () => {
        const column = {
          key: 'name',
          header: 'Name',
          width: 200,
          sortable: true,
          align: 'center' as const,
          format: 'string',
        };
        const result = tableColumnConfigSchema.safeParse(column);
        expect(result.success).toBe(true);
      });

      it('should validate all align options', () => {
        for (const align of ['left', 'center', 'right']) {
          const column = { key: 'name', header: 'Name', align };
          const result = tableColumnConfigSchema.safeParse(column);
          expect(result.success).toBe(true);
        }
      });
    });

    describe('metricThresholdSchema', () => {
      it('should validate valid threshold', () => {
        const threshold = { value: 80, severity: 'warning' as const };
        const result = metricThresholdSchema.safeParse(threshold);
        expect(result.success).toBe(true);
      });

      it('should validate threshold with optional label', () => {
        const threshold = { value: 80, severity: 'error' as const, label: 'High' };
        const result = metricThresholdSchema.safeParse(threshold);
        expect(result.success).toBe(true);
      });

      it('should validate all severity levels', () => {
        for (const severity of ['warning', 'error', 'critical']) {
          const threshold = { value: 80, severity };
          const result = metricThresholdSchema.safeParse(threshold);
          expect(result.success).toBe(true);
        }
      });

      it('should reject threshold with invalid severity', () => {
        const threshold = { value: 80, severity: 'info' };
        const result = metricThresholdSchema.safeParse(threshold);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Integration tests', () => {
    it('should validate a complete dashboard with multiple widget types', () => {
      const fullDashboard = {
        dashboard_id: 'full-dashboard',
        name: 'Full Dashboard',
        description: 'A dashboard with all widget types',
        layout: { columns: 12, row_height: 100, gap: 16, responsive: true },
        widgets: [
          {
            widget_id: 'chart-1',
            title: 'Request Trends',
            config: validChartConfig,
            row: 0,
            col: 0,
            width: 6,
            height: 3,
          },
          {
            widget_id: 'table-1',
            title: 'Agent List',
            config: validTableConfig,
            row: 0,
            col: 6,
            width: 6,
            height: 3,
          },
          {
            widget_id: 'metric-1',
            title: 'Active Agents',
            config: validMetricCardConfig,
            row: 3,
            col: 0,
            width: 3,
            height: 2,
          },
          {
            widget_id: 'status-1',
            title: 'Service Status',
            config: validStatusGridConfig,
            row: 3,
            col: 3,
            width: 3,
            height: 2,
          },
          {
            widget_id: 'events-1',
            title: 'Recent Events',
            config: validEventFeedConfig,
            row: 3,
            col: 6,
            width: 6,
            height: 4,
          },
        ],
        data_source: '/api/dashboard/full',
        refresh_interval_seconds: 30,
        theme: 'dark' as const,
        initial_status: 'initializing' as const,
      };

      const result = dashboardConfigSchema.safeParse(fullDashboard);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.widgets).toHaveLength(5);
      }
    });

    it('should reject dashboard with widget containing invalid config for its type', () => {
      const dashboard = {
        ...validDashboardConfig,
        widgets: [
          {
            widget_id: 'broken-widget',
            title: 'Broken Widget',
            config: {
              config_kind: 'chart',
              chart_type: 'line',
              // Missing required 'series' field
            },
            row: 0,
            col: 0,
            width: 6,
            height: 3,
          },
        ],
      };

      const result = dashboardConfigSchema.safeParse(dashboard);
      expect(result.success).toBe(false);
    });
  });
});
