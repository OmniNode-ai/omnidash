/**
 * Registry Discovery Dashboard Configuration
 *
 * Contract-driven dashboard showing registered nodes and live service instances
 * from Consul service discovery. Displays node metadata, health status, and
 * real-time instance information.
 *
 * Data source: /api/registry/discovery
 */

import type { DashboardConfig, DashboardData } from '@/lib/dashboard-schema';
import { DashboardTheme } from '@/lib/dashboard-schema';

// Types for Registry Discovery data
export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR';

export type NodeState = 'registered' | 'active' | 'inactive' | 'pending' | 'deprecated' | 'failed';

export type HealthStatus = 'passing' | 'warning' | 'critical' | 'unknown';

export interface RegisteredNodeInfo {
  name: string;
  node_type: NodeType;
  state: NodeState;
  version: string;
  capabilities: string;
  description?: string;
  registered_at?: string;
}

export interface LiveInstanceInfo {
  service_name: string;
  address: string;
  port: number;
  health_status: HealthStatus;
  last_check_at: string;
  tags?: string[];
}

export interface RegistryDiscoverySummary {
  total_nodes: number;
  active_nodes: number;
  pending_nodes: number;
  failed_nodes: number;
  by_type: { name: string; value: number }[];
  by_health: {
    passing: number;
    warning: number;
    critical: number;
    unknown: number;
  };
}

export interface RegistryDiscoveryData extends DashboardData {
  summary: RegistryDiscoverySummary;
  nodes: RegisteredNodeInfo[];
  live_instances: LiveInstanceInfo[];
  warnings?: string[];
}

export const registryDiscoveryDashboardConfig: DashboardConfig = {
  dashboard_id: 'registry-discovery',
  name: 'Registry Discovery',
  description: 'Contract-driven dashboard showing registered nodes and live service instances',
  theme: DashboardTheme.SYSTEM,
  layout: {
    columns: 12,
    row_height: 100,
    gap: 16,
    responsive: true,
  },
  data_source: 'api:/api/registry/discovery',
  refresh_interval_seconds: 30,
  widgets: [
    // Row 0: Summary metrics (4 cards)
    {
      widget_id: 'total-nodes',
      title: 'Total Nodes',
      description: 'Total number of registered nodes',
      row: 0,
      col: 0,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'summary.total_nodes',
        label: 'Total Nodes',
        value_format: 'number',
        precision: 0,
        icon: 'server',
      },
    },
    {
      widget_id: 'active-nodes',
      title: 'Active Nodes',
      description: 'Nodes currently in active state',
      row: 0,
      col: 3,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'summary.active_nodes',
        label: 'Active',
        value_format: 'number',
        precision: 0,
        icon: 'check-circle',
        thresholds: [{ value: 0, severity: 'warning', label: 'None active' }],
      },
    },
    {
      widget_id: 'pending-nodes',
      title: 'Pending Nodes',
      description: 'Nodes awaiting registration or activation',
      row: 0,
      col: 6,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'summary.pending_nodes',
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
      widget_id: 'failed-nodes',
      title: 'Failed Nodes',
      description: 'Nodes with failed or error state',
      row: 0,
      col: 9,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'summary.failed_nodes',
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

    // Row 1-2: Node type distribution (pie) + Health status (status grid)
    {
      widget_id: 'node-type-distribution',
      title: 'Node Types',
      description: 'Distribution of nodes by type',
      row: 1,
      col: 0,
      width: 6,
      height: 2,
      config: {
        config_kind: 'chart',
        chart_type: 'pie',
        series: [{ name: 'Node Types', data_key: 'summary.by_type' }],
        show_legend: true,
      },
    },
    {
      widget_id: 'health-status',
      title: 'Instance Health',
      description: 'Health status of live service instances',
      row: 1,
      col: 6,
      width: 6,
      height: 2,
      config: {
        config_kind: 'status_grid',
        items_key: 'healthStatusItems',
        id_field: 'id',
        label_field: 'label',
        status_field: 'status',
        columns: 2,
        show_labels: true,
        compact: false,
      },
    },

    // Row 3-5: Registered nodes table
    {
      widget_id: 'nodes-table',
      title: 'Registered Nodes',
      description: 'All registered nodes with their metadata',
      row: 3,
      col: 0,
      width: 12,
      height: 3,
      config: {
        config_kind: 'table',
        rows_key: 'nodes',
        columns: [
          { key: 'name', header: 'Name', sortable: true, width: 200 },
          { key: 'node_type', header: 'Type', sortable: true, width: 120 },
          { key: 'state', header: 'State', format: 'badge', sortable: true, width: 120 },
          { key: 'version', header: 'Version', width: 100 },
          { key: 'capabilities', header: 'Capabilities', width: 250 },
        ],
        page_size: 10,
        show_pagination: true,
        default_sort_key: 'name',
        default_sort_direction: 'asc',
        striped: true,
        hover_highlight: true,
      },
    },

    // Row 6-8: Live instances table
    {
      widget_id: 'instances-table',
      title: 'Live Instances',
      description: 'Active service instances from Consul',
      row: 6,
      col: 0,
      width: 12,
      height: 3,
      config: {
        config_kind: 'table',
        rows_key: 'live_instances',
        columns: [
          { key: 'service_name', header: 'Service', sortable: true, width: 200 },
          { key: 'address', header: 'Address', width: 150 },
          { key: 'port', header: 'Port', width: 80, align: 'right' },
          { key: 'health_status', header: 'Health', format: 'badge', sortable: true, width: 100 },
          {
            key: 'last_check_at',
            header: 'Last Check',
            format: 'datetime',
            sortable: true,
            width: 180,
          },
        ],
        page_size: 10,
        show_pagination: true,
        default_sort_key: 'service_name',
        default_sort_direction: 'asc',
        striped: true,
        hover_highlight: true,
      },
    },
  ],
};

/**
 * Transform API response to dashboard-friendly format.
 * Converts health summary to status grid items.
 */
export function transformRegistryData(data: RegistryDiscoveryData): DashboardData {
  const healthStatusItems = [
    {
      id: 'passing',
      label: `Passing (${data.summary.by_health.passing})`,
      status: data.summary.by_health.passing > 0 ? 'healthy' : 'warning',
    },
    {
      id: 'warning',
      label: `Warning (${data.summary.by_health.warning})`,
      status: data.summary.by_health.warning > 0 ? 'warning' : 'healthy',
    },
    {
      id: 'critical',
      label: `Critical (${data.summary.by_health.critical})`,
      status: data.summary.by_health.critical > 0 ? 'error' : 'healthy',
    },
    {
      id: 'unknown',
      label: `Unknown (${data.summary.by_health.unknown})`,
      status: data.summary.by_health.unknown > 0 ? 'warning' : 'healthy',
    },
  ];

  return {
    ...data,
    healthStatusItems,
  };
}

/**
 * Generate mock data for development and testing
 */
export function generateMockRegistryDiscoveryData(): RegistryDiscoveryData {
  const now = new Date();

  const nodes: RegisteredNodeInfo[] = [
    {
      name: 'NodeAuthEffect',
      node_type: 'EFFECT',
      state: 'active',
      version: '1.4.2',
      capabilities: 'authenticate, authorize, token-refresh',
    },
    {
      name: 'NodeTransformCompute',
      node_type: 'COMPUTE',
      state: 'active',
      version: '1.4.2',
      capabilities: 'json-transform, xml-parse, csv-convert',
    },
    {
      name: 'NodeAggregateReducer',
      node_type: 'REDUCER',
      state: 'active',
      version: '1.4.1',
      capabilities: 'sum, avg, count, group-by',
    },
    {
      name: 'NodeWorkflowOrchestrator',
      node_type: 'ORCHESTRATOR',
      state: 'active',
      version: '1.4.2',
      capabilities: 'parallel-execute, conditional-branch, retry',
    },
    {
      name: 'NodeDatabaseEffect',
      node_type: 'EFFECT',
      state: 'pending',
      version: '1.4.2',
      capabilities: 'query, insert, update, delete',
    },
    {
      name: 'NodeMLCompute',
      node_type: 'COMPUTE',
      state: 'pending',
      version: '1.4.2',
      capabilities: 'inference, embedding, classification',
    },
    {
      name: 'NodeCacheReducer',
      node_type: 'REDUCER',
      state: 'failed',
      version: '1.3.9',
      capabilities: 'lru-cache, distributed-cache',
    },
    {
      name: 'NodeQueueEffect',
      node_type: 'EFFECT',
      state: 'active',
      version: '1.4.2',
      capabilities: 'enqueue, dequeue, peek',
    },
  ];

  const live_instances: LiveInstanceInfo[] = [
    {
      service_name: 'node-auth-effect',
      address: '192.168.86.201',
      port: 8001,
      health_status: 'passing',
      last_check_at: new Date(now.getTime() - 5000).toISOString(),
    },
    {
      service_name: 'node-transform-compute',
      address: '192.168.86.201',
      port: 8002,
      health_status: 'passing',
      last_check_at: new Date(now.getTime() - 8000).toISOString(),
    },
    {
      service_name: 'node-aggregate-reducer',
      address: '192.168.86.200',
      port: 8003,
      health_status: 'warning',
      last_check_at: new Date(now.getTime() - 30000).toISOString(),
    },
    {
      service_name: 'node-workflow-orchestrator',
      address: '192.168.86.200',
      port: 8004,
      health_status: 'passing',
      last_check_at: new Date(now.getTime() - 3000).toISOString(),
    },
    {
      service_name: 'node-queue-effect',
      address: '192.168.86.100',
      port: 8005,
      health_status: 'passing',
      last_check_at: new Date(now.getTime() - 12000).toISOString(),
    },
  ];

  const activeNodes = nodes.filter((n) => n.state === 'active').length;
  const pendingNodes = nodes.filter((n) => n.state === 'pending').length;
  const failedNodes = nodes.filter((n) => n.state === 'failed').length;

  const typeCounts = nodes.reduce(
    (acc, n) => {
      acc[n.node_type] = (acc[n.node_type] || 0) + 1;
      return acc;
    },
    {} as Record<NodeType, number>
  );

  const by_type = Object.entries(typeCounts).map(([name, value]) => ({
    name,
    value,
  }));

  const healthCounts = live_instances.reduce(
    (acc, i) => {
      acc[i.health_status] = (acc[i.health_status] || 0) + 1;
      return acc;
    },
    { passing: 0, warning: 0, critical: 0, unknown: 0 } as Record<HealthStatus, number>
  );

  return {
    summary: {
      total_nodes: nodes.length,
      active_nodes: activeNodes,
      pending_nodes: pendingNodes,
      failed_nodes: failedNodes,
      by_type,
      by_health: healthCounts,
    },
    nodes,
    live_instances,
  };
}
