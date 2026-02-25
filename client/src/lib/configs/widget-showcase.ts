/**
 * Widget Showcase Dashboard Config
 *
 * Tests all 5 widget types: metric_card, chart, table, status_grid, event_feed
 */

import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';
import { DashboardTheme } from '@/lib/dashboard-schema';

export const widgetShowcaseDashboardConfig: DashboardConfig = {
  dashboard_id: 'widget-showcase',
  name: 'Widget Showcase',
  description: 'Testing all 5 contract-driven widget types',
  theme: DashboardTheme.SYSTEM,
  layout: {
    columns: 12,
    row_height: 100,
    gap: 16,
  },
  data_source: 'static:showcase',
  widgets: [
    // Row 0: Metric Cards (4 across) - using 0-based indexing
    {
      widget_id: 'metric-1',
      title: 'Active Agents',
      row: 0,
      col: 0,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'activeAgents',
        label: 'Active Agents',
        value_format: 'number',
      },
    },
    {
      widget_id: 'metric-2',
      title: 'Success Rate',
      row: 0,
      col: 3,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'successRate',
        label: 'Success Rate',
        value_format: 'percent',
        thresholds: [
          { value: 80, severity: 'warning' },
          { value: 60, severity: 'error' },
        ],
      },
    },
    {
      widget_id: 'metric-3',
      title: 'Avg Latency',
      row: 0,
      col: 6,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'avgLatency',
        label: 'Avg Latency',
        value_format: 'duration',
        unit: 'ms',
        thresholds: [
          { value: 500, severity: 'warning' },
          { value: 1000, severity: 'error' },
        ],
      },
    },
    {
      widget_id: 'metric-4',
      title: 'Total Events',
      row: 0,
      col: 9,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'totalEvents',
        label: 'Total Events',
        value_format: 'number',
      },
    },

    // Row 1: Line Chart (left)
    {
      widget_id: 'chart-line',
      title: 'Request Volume Over Time',
      row: 1,
      col: 0,
      width: 8,
      height: 3,
      config: {
        config_kind: 'chart',
        chart_type: 'line',
        series: [
          { name: 'Requests', data_key: 'requests' },
          { name: 'Errors', data_key: 'errors' },
        ],
        x_axis: { label: 'Time', show_grid: true },
        y_axis: { label: 'Count', show_grid: true },
        show_legend: true,
      },
    },

    // Row 1: Status Grid (right side)
    {
      widget_id: 'status-grid',
      title: 'Agent Status',
      row: 1,
      col: 8,
      width: 4,
      height: 3,
      config: {
        config_kind: 'status_grid',
        items_key: 'agentStatuses',
        id_field: 'id',
        label_field: 'name',
        status_field: 'status',
        columns: 2,
        show_labels: true,
      },
    },

    // Row 4: Bar Chart and Pie Chart
    {
      widget_id: 'chart-bar',
      title: 'Events by Type',
      row: 4,
      col: 0,
      width: 6,
      height: 3,
      config: {
        config_kind: 'chart',
        chart_type: 'bar',
        series: [{ name: 'Count', data_key: 'count' }],
        x_axis: { label: 'Type' },
        y_axis: { label: 'Count', show_grid: true },
      },
    },
    {
      widget_id: 'chart-pie',
      title: 'Status Distribution',
      row: 4,
      col: 6,
      width: 6,
      height: 3,
      config: {
        config_kind: 'chart',
        chart_type: 'pie',
        series: [{ name: 'Status', data_key: 'statusDistribution' }],
        show_legend: true,
      },
    },

    // Row 7: Table (left) and Event Feed (right)
    {
      widget_id: 'table-agents',
      title: 'Recent Agent Actions',
      row: 7,
      col: 0,
      width: 7,
      height: 4,
      config: {
        config_kind: 'table',
        rows_key: 'recentActions',
        columns: [
          { key: 'agent', header: 'Agent', sortable: true },
          { key: 'action', header: 'Action' },
          { key: 'status', header: 'Status', format: 'badge' },
          { key: 'duration', header: 'Duration (ms)', sortable: true, align: 'right' },
          { key: 'timestamp', header: 'Time', format: 'datetime', sortable: true },
        ],
        page_size: 5,
        show_pagination: true,
        striped: true,
        hover_highlight: true,
      },
    },
    {
      widget_id: 'event-feed',
      title: 'Live Events',
      row: 7,
      col: 7,
      width: 5,
      height: 4,
      config: {
        config_kind: 'event_feed',
        events_key: 'liveEvents',
        max_items: 20,
        show_timestamp: true,
        show_severity: true,
        auto_scroll: true,
      },
    },
  ],
};

// Fixed base time for deterministic mock data in demos and tests
const BASE_TIME = new Date('2026-01-20T00:00:00.000Z').getTime();
const isoAt = (offsetMs = 0) => new Date(BASE_TIME - offsetMs).toISOString();

/**
 * Mock data for the widget showcase
 */
export const widgetShowcaseMockData: DashboardData = {
  // Metric card data
  activeAgents: 47,
  successRate: 94.2,
  avgLatency: 156,
  totalEvents: 12847,

  // Line chart time series (array of objects)
  // Uses 'name' field for X-axis compatibility with ChartWidget's XAxis dataKey="name"
  requestTimeSeries: [
    { name: '00:00', requests: 120, errors: 3 },
    { name: '04:00', requests: 85, errors: 2 },
    { name: '08:00', requests: 230, errors: 8 },
    { name: '12:00', requests: 310, errors: 12 },
    { name: '16:00', requests: 275, errors: 6 },
    { name: '20:00', requests: 180, errors: 4 },
  ],

  // Status grid data (array with id, name, status)
  agentStatuses: [
    { id: '1', name: 'Agent-001', status: 'healthy' },
    { id: '2', name: 'Agent-002', status: 'healthy' },
    { id: '3', name: 'Agent-003', status: 'warning' },
    { id: '4', name: 'Agent-004', status: 'healthy' },
    { id: '5', name: 'Agent-005', status: 'error' },
    { id: '6', name: 'Agent-006', status: 'healthy' },
    { id: '7', name: 'Agent-007', status: 'healthy' },
    { id: '8', name: 'Agent-008', status: 'warning' },
  ],

  // Bar chart data
  // Uses 'name' field for X-axis compatibility with ChartWidget's XAxis dataKey="name"
  eventsByType: [
    { name: 'Routing', count: 342 },
    { name: 'Transform', count: 256 },
    { name: 'Validate', count: 189 },
    { name: 'Execute', count: 421 },
    { name: 'Complete', count: 398 },
  ],

  // Pie chart data
  statusDistribution: [
    { name: 'Success', value: 847 },
    { name: 'Warning', value: 123 },
    { name: 'Error', value: 34 },
    { name: 'Pending', value: 56 },
  ],

  // Table data
  recentActions: [
    {
      agent: 'CodeReviewer',
      action: 'analyze_pr',
      status: 'success',
      duration: 234,
      timestamp: isoAt(),
    },
    {
      agent: 'TestRunner',
      action: 'run_tests',
      status: 'success',
      duration: 1250,
      timestamp: isoAt(60000),
    },
    {
      agent: 'Deployer',
      action: 'deploy_staging',
      status: 'warning',
      duration: 3400,
      timestamp: isoAt(120000),
    },
    {
      agent: 'Monitor',
      action: 'health_check',
      status: 'success',
      duration: 45,
      timestamp: isoAt(180000),
    },
    {
      agent: 'Analyzer',
      action: 'parse_logs',
      status: 'error',
      duration: 890,
      timestamp: isoAt(240000),
    },
    {
      agent: 'Builder',
      action: 'compile_code',
      status: 'success',
      duration: 2100,
      timestamp: isoAt(300000),
    },
    {
      agent: 'Validator',
      action: 'check_types',
      status: 'success',
      duration: 156,
      timestamp: isoAt(360000),
    },
  ],

  // Event feed data
  liveEvents: [
    {
      type: 'info',
      message: 'Agent CodeReviewer started analysis',
      timestamp: isoAt(),
    },
    {
      type: 'success',
      message: 'Test suite completed: 156 passed, 0 failed',
      timestamp: isoAt(30000),
    },
    {
      type: 'warning',
      message: 'High latency detected on staging deployment',
      timestamp: isoAt(60000),
    },
    {
      type: 'info',
      message: 'New routing decision: Agent-007 selected',
      timestamp: isoAt(90000),
    },
    {
      type: 'error',
      message: 'Log parsing failed: invalid format',
      timestamp: isoAt(120000),
    },
    {
      type: 'success',
      message: 'Build completed successfully',
      timestamp: isoAt(150000),
    },
    {
      type: 'info',
      message: 'Type checking passed with 0 errors',
      timestamp: isoAt(180000),
    },
    {
      type: 'info',
      message: 'WebSocket connection established',
      timestamp: isoAt(210000),
    },
  ],
};
