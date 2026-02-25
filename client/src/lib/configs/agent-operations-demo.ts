/**
 * Agent Operations Dashboard
 *
 * Dashboard configuration for event-driven metrics.
 * Data flows: Kafka → EventConsumer → WebSocket → Dashboard
 */

import type { DashboardConfig } from '@/lib/dashboard-schema';
import { DashboardTheme } from '@/lib/dashboard-schema';

export const agentOperationsDashboardConfig: DashboardConfig = {
  dashboard_id: 'agent-operations-live',
  name: 'Agent Operations',
  description: 'Event-driven metrics from Kafka → WebSocket',
  layout: {
    columns: 12,
    row_height: 120,
    gap: 16,
  },
  data_source: 'websocket:kafka-events',
  widgets: [
    {
      widget_id: 'widget-active-agents',
      title: 'Active Agents',
      description: 'Number of agents that have processed requests',
      row: 0,
      col: 0,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'activeAgents',
        label: 'Active Agents',
        value_format: 'number',
        precision: 0,
      },
    },
    {
      widget_id: 'widget-total-requests',
      title: 'Total Requests',
      description: 'Total routing decisions processed',
      row: 0,
      col: 3,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'totalRequests',
        label: 'Total Requests',
        value_format: 'number',
        precision: 0,
      },
    },
    {
      widget_id: 'widget-avg-confidence',
      title: 'Avg Confidence',
      description: 'Average routing confidence score',
      row: 0,
      col: 6,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'avgConfidence',
        label: 'Avg Confidence',
        value_format: 'percent',
        precision: 1,
        thresholds: [
          { value: 90, severity: 'warning', label: 'Below 90%' },
          { value: 80, severity: 'error', label: 'Below 80%' },
        ],
      },
    },
    {
      widget_id: 'widget-avg-latency',
      title: 'Avg Latency',
      description: 'Average routing duration in milliseconds',
      row: 0,
      col: 9,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'avgLatencyMs',
        label: 'Avg Latency',
        value_format: 'duration',
        precision: 0,
        thresholds: [
          { value: 500, severity: 'critical', label: 'Unacceptable' },
          { value: 200, severity: 'warning', label: 'Elevated' },
        ],
      },
    },
  ],
  theme: DashboardTheme.SYSTEM,
};
