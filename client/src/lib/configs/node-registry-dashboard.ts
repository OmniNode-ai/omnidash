/**
 * Node Registry Dashboard Configuration
 *
 * Real-time visualization of 2-way node registration events from omnibase_infra.
 * Displays node introspection, heartbeat, and registration state transitions.
 *
 * Data flows: Kafka → EventConsumer → WebSocket → Dashboard
 */

import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';
import { DashboardTheme } from '@/lib/dashboard-schema';

// Event Schemas (from omnibase_infra)
export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR' | 'SERVICE';

export type RegistrationState =
  | 'pending_registration'
  | 'accepted'
  | 'awaiting_ack'
  | 'ack_received'
  | 'active'
  | 'rejected'
  | 'ack_timed_out'
  | 'liveness_expired';

export type IntrospectionReason = 'STARTUP' | 'HEARTBEAT' | 'REQUESTED';

export interface NodeIntrospection {
  node_id: string;
  node_type: NodeType;
  node_version: string;
  endpoints: Record<string, string>;
  current_state: string;
  reason: IntrospectionReason;
  correlation_id: string;
  timestamp: string;
}

export interface NodeHeartbeat {
  node_id: string;
  uptime_seconds: number;
  active_operations_count: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
  timestamp: string;
}

export interface RegisteredNode {
  node_id: string;
  node_type: NodeType;
  state: RegistrationState;
  version: string;
  uptime_seconds: number;
  last_seen: string;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
}

export interface RegistrationEvent {
  type: 'registration' | 'state_change' | 'heartbeat' | 'introspection';
  node_id: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
}

export const nodeRegistryDashboardConfig: DashboardConfig = {
  dashboard_id: 'node-registry',
  name: 'Node Registry',
  description: 'Real-time node registration and health monitoring',
  theme: DashboardTheme.SYSTEM,
  layout: {
    columns: 12,
    row_height: 100,
    gap: 16,
  },
  data_source: 'websocket:node-registry',
  refresh_interval_seconds: 5,
  widgets: [
    // Row 0: Metric Cards (4 across)
    {
      widget_id: 'metric-total-nodes',
      title: 'Total Nodes Registered',
      description: 'Total number of nodes registered in the system',
      row: 0,
      col: 0,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'totalNodes',
        label: 'Total Nodes',
        value_format: 'number',
        precision: 0,
        icon: 'server',
      },
    },
    {
      widget_id: 'metric-active-nodes',
      title: 'Active Nodes',
      description: 'Nodes currently in active state',
      row: 0,
      col: 3,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'activeNodes',
        label: 'Active Nodes',
        value_format: 'number',
        precision: 0,
        icon: 'check-circle',
      },
    },
    {
      widget_id: 'metric-pending-nodes',
      title: 'Pending Registrations',
      description: 'Nodes awaiting registration completion',
      row: 0,
      col: 6,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'pendingNodes',
        label: 'Pending',
        value_format: 'number',
        precision: 0,
        icon: 'clock',
        thresholds: [
          { value: 5, severity: 'warning', label: 'Many pending' },
          { value: 10, severity: 'error', label: 'Too many pending' },
        ],
      },
    },
    {
      widget_id: 'metric-failed-nodes',
      title: 'Failed Registrations',
      description: 'Nodes with rejected or expired registrations',
      row: 0,
      col: 9,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'failedNodes',
        label: 'Failed',
        value_format: 'number',
        precision: 0,
        icon: 'alert-circle',
        thresholds: [
          { value: 1, severity: 'warning', label: 'Has failures' },
          { value: 3, severity: 'error', label: 'Multiple failures' },
        ],
      },
    },

    // Row 1-3: Status Grid (left) and Pie Chart (right)
    {
      widget_id: 'status-grid-nodes',
      title: 'Node Status Overview',
      description: 'All registered nodes with their current health status',
      row: 1,
      col: 0,
      width: 7,
      height: 3,
      config: {
        config_kind: 'status_grid',
        items_key: 'nodeStatuses',
        id_field: 'node_id',
        label_field: 'node_id',
        status_field: 'status',
        columns: 3,
        show_labels: true,
        compact: false,
      },
    },
    {
      widget_id: 'chart-node-types',
      title: 'Node Distribution by Type',
      description: 'Breakdown of nodes by their functional type',
      row: 1,
      col: 7,
      width: 5,
      height: 3,
      config: {
        config_kind: 'chart',
        chart_type: 'pie',
        series: [{ name: 'Node Types', data_key: 'nodeTypeDistribution' }],
        show_legend: true,
      },
    },

    // Row 4-7: Table (left) and Event Feed (right)
    {
      widget_id: 'table-node-details',
      title: 'Node Details',
      description: 'Detailed view of all registered nodes',
      row: 4,
      col: 0,
      width: 7,
      height: 4,
      config: {
        config_kind: 'table',
        rows_key: 'registeredNodes',
        columns: [
          { key: 'node_id', header: 'Node ID', sortable: true, width: 150 },
          { key: 'node_type', header: 'Type', sortable: true, width: 100 },
          { key: 'state', header: 'State', format: 'badge', sortable: true, width: 120 },
          { key: 'version', header: 'Version', width: 80 },
          {
            key: 'uptime_seconds',
            header: 'Uptime',
            format: 'duration',
            sortable: true,
            align: 'right',
            width: 100,
          },
          { key: 'last_seen', header: 'Last Seen', format: 'datetime', sortable: true, width: 140 },
        ],
        page_size: 6,
        show_pagination: true,
        default_sort_key: 'last_seen',
        default_sort_direction: 'desc',
        striped: true,
        hover_highlight: true,
      },
    },
    {
      widget_id: 'event-feed-registrations',
      title: 'Registration Events',
      description: 'Live stream of registration events and state changes',
      row: 4,
      col: 7,
      width: 5,
      height: 4,
      config: {
        config_kind: 'event_feed',
        events_key: 'registrationEvents',
        max_items: 25,
        show_timestamp: true,
        show_severity: true,
        show_source: false,
        group_by_type: false,
        auto_scroll: true,
      },
    },
  ],
};

/**
 * Generate realistic mock data for the Node Registry dashboard
 */
export function generateNodeRegistryMockData(): DashboardData {
  const now = new Date();

  // Generate 8 nodes with various states and types
  const nodes: RegisteredNode[] = [
    {
      node_id: 'node-effect-auth-001',
      node_type: 'EFFECT',
      state: 'active',
      version: '1.4.2',
      uptime_seconds: 86400,
      last_seen: new Date(now.getTime() - 5000).toISOString(),
      memory_usage_mb: 256,
      cpu_usage_percent: 12,
    },
    {
      node_id: 'node-compute-transform-002',
      node_type: 'COMPUTE',
      state: 'active',
      version: '1.4.2',
      uptime_seconds: 72000,
      last_seen: new Date(now.getTime() - 3000).toISOString(),
      memory_usage_mb: 512,
      cpu_usage_percent: 45,
    },
    {
      node_id: 'node-reducer-aggregate-003',
      node_type: 'REDUCER',
      state: 'active',
      version: '1.4.1',
      uptime_seconds: 43200,
      last_seen: new Date(now.getTime() - 8000).toISOString(),
      memory_usage_mb: 384,
      cpu_usage_percent: 22,
    },
    {
      node_id: 'node-orchestrator-main-004',
      node_type: 'ORCHESTRATOR',
      state: 'active',
      version: '1.4.2',
      uptime_seconds: 172800,
      last_seen: new Date(now.getTime() - 2000).toISOString(),
      memory_usage_mb: 768,
      cpu_usage_percent: 35,
    },
    {
      node_id: 'node-effect-db-005',
      node_type: 'EFFECT',
      state: 'awaiting_ack',
      version: '1.4.2',
      uptime_seconds: 300,
      last_seen: new Date(now.getTime() - 10000).toISOString(),
      memory_usage_mb: 128,
      cpu_usage_percent: 5,
    },
    {
      node_id: 'node-compute-ml-006',
      node_type: 'COMPUTE',
      state: 'pending_registration',
      version: '1.4.2',
      uptime_seconds: 60,
      last_seen: new Date(now.getTime() - 15000).toISOString(),
      memory_usage_mb: 1024,
      cpu_usage_percent: 78,
    },
    {
      node_id: 'node-reducer-cache-007',
      node_type: 'REDUCER',
      state: 'liveness_expired',
      version: '1.3.9',
      uptime_seconds: 0,
      last_seen: new Date(now.getTime() - 300000).toISOString(),
      memory_usage_mb: 0,
      cpu_usage_percent: 0,
    },
    {
      node_id: 'node-effect-queue-008',
      node_type: 'EFFECT',
      state: 'active',
      version: '1.4.2',
      uptime_seconds: 28800,
      last_seen: new Date(now.getTime() - 4000).toISOString(),
      memory_usage_mb: 192,
      cpu_usage_percent: 18,
    },
  ];

  // Calculate metrics
  const activeNodes = nodes.filter((n) => n.state === 'active').length;
  const pendingNodes = nodes.filter((n) =>
    ['pending_registration', 'awaiting_ack', 'ack_received'].includes(n.state)
  ).length;
  const failedNodes = nodes.filter((n) =>
    ['rejected', 'liveness_expired', 'ack_timed_out'].includes(n.state)
  ).length;

  // Map states to status grid colors
  const stateToStatus = (state: RegistrationState): 'healthy' | 'warning' | 'error' => {
    switch (state) {
      case 'active':
        return 'healthy';
      case 'pending_registration':
      case 'accepted':
      case 'awaiting_ack':
      case 'ack_received':
        return 'warning';
      case 'rejected':
      case 'ack_timed_out':
      case 'liveness_expired':
        return 'error';
      default: {
        // Exhaustiveness check - will error if new states are added
        const _exhaustiveCheck: never = state;
        return _exhaustiveCheck;
      }
    }
  };

  const nodeStatuses = nodes.map((n) => ({
    node_id: n.node_id,
    status: stateToStatus(n.state),
  }));

  // Node type distribution for pie chart
  const typeCounts = nodes.reduce(
    (acc, n) => {
      acc[n.node_type] = (acc[n.node_type] || 0) + 1;
      return acc;
    },
    {} as Record<NodeType, number>
  );

  const nodeTypeDistribution = Object.entries(typeCounts).map(([name, value]) => ({
    name,
    value,
  }));

  // Generate registration events
  const registrationEvents: RegistrationEvent[] = [
    {
      type: 'registration',
      node_id: 'node-compute-ml-006',
      message: 'Node node-compute-ml-006 initiated registration (STARTUP)',
      severity: 'info',
      timestamp: new Date(now.getTime() - 15000).toISOString(),
    },
    {
      type: 'state_change',
      node_id: 'node-effect-db-005',
      message: 'Node node-effect-db-005 state changed: accepted -> awaiting_ack',
      severity: 'info',
      timestamp: new Date(now.getTime() - 12000).toISOString(),
    },
    {
      type: 'heartbeat',
      node_id: 'node-orchestrator-main-004',
      message: 'Heartbeat received from node-orchestrator-main-004 (48h uptime)',
      severity: 'success',
      timestamp: new Date(now.getTime() - 8000).toISOString(),
    },
    {
      type: 'state_change',
      node_id: 'node-reducer-cache-007',
      message: 'Node node-reducer-cache-007 state changed: active -> liveness_expired',
      severity: 'error',
      timestamp: new Date(now.getTime() - 300000).toISOString(),
    },
    {
      type: 'introspection',
      node_id: 'node-effect-auth-001',
      message: 'Introspection response from node-effect-auth-001 (HEARTBEAT)',
      severity: 'success',
      timestamp: new Date(now.getTime() - 5000).toISOString(),
    },
    {
      type: 'registration',
      node_id: 'node-effect-queue-008',
      message: 'Node node-effect-queue-008 registration completed successfully',
      severity: 'success',
      timestamp: new Date(now.getTime() - 28800000).toISOString(),
    },
    {
      type: 'heartbeat',
      node_id: 'node-compute-transform-002',
      message: 'Heartbeat received from node-compute-transform-002 (CPU: 45%)',
      severity: 'warning',
      timestamp: new Date(now.getTime() - 3000).toISOString(),
    },
    {
      type: 'state_change',
      node_id: 'node-reducer-aggregate-003',
      message: 'Node node-reducer-aggregate-003 acknowledged registration',
      severity: 'success',
      timestamp: new Date(now.getTime() - 43200000).toISOString(),
    },
  ];

  return {
    // Metric card data
    totalNodes: nodes.length,
    activeNodes,
    pendingNodes,
    failedNodes,

    // Status grid data
    nodeStatuses,

    // Pie chart data
    nodeTypeDistribution,

    // Table data
    registeredNodes: nodes,

    // Event feed data
    registrationEvents,
  };
}
