/**
 * Event Bus Monitor Dashboard Configuration
 *
 * Real-time Kafka event stream visualization dashboard.
 * Monitors agent and ONEX event topics via WebSocket connection to server.
 *
 * Topics monitored (from server/event-consumer.ts):
 * Agent topics:
 * - agent-routing-decisions
 * - agent-transformation-events
 * - router-performance-metrics
 * - agent-actions
 *
 * Node registry topics (actual Kafka topic names from omnibase_infra):
 * - dev.omninode_bridge.onex.evt.node-introspection.v1
 * - dev.onex.evt.registration-completed.v1
 * - node.heartbeat
 * - dev.omninode_bridge.onex.evt.registry-request-introspection.v1
 */

import type { DashboardConfig } from '@/lib/dashboard-schema';
import { DashboardTheme } from '@/lib/dashboard-schema';

/**
 * Event message schema from omnibase_infra Kafka events
 */
export interface EventMessage {
  topic: string;
  key: string | null;
  value: string; // JSON serialized
  headers: EventHeaders;
  offset: string;
  partition: number;
}

export interface EventHeaders {
  content_type: string;
  correlation_id: string;
  message_id: string;
  timestamp: string;
  source: string;
  event_type: string;
  schema_version: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  retry_count: number;
}

/**
 * Topics monitored by this dashboard
 * Split into agent topics (core functionality) and node registry topics
 */
export const AGENT_TOPICS = [
  'agent-routing-decisions',
  'agent-transformation-events',
  'router-performance-metrics',
  'agent-actions',
] as const;

export const NODE_TOPICS = [
  'dev.omninode_bridge.onex.evt.node-introspection.v1',
  'dev.onex.evt.registration-completed.v1',
  'node.heartbeat',
  'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
] as const;

export const MONITORED_TOPICS = [...AGENT_TOPICS, ...NODE_TOPICS] as const;

export type AgentTopic = (typeof AGENT_TOPICS)[number];
export type NodeTopic = (typeof NODE_TOPICS)[number];
export type MonitoredTopic = (typeof MONITORED_TOPICS)[number];

/**
 * Topic metadata for display
 */
export const TOPIC_METADATA: Record<
  string,
  { label: string; description: string; category: string }
> = {
  // Agent topics
  'agent-routing-decisions': {
    label: 'Routing Decisions',
    description: 'Agent selection and routing decisions with confidence scores',
    category: 'routing',
  },
  'agent-transformation-events': {
    label: 'Transformations',
    description: 'Polymorphic agent transformation events',
    category: 'transformation',
  },
  'router-performance-metrics': {
    label: 'Performance',
    description: 'Routing performance metrics and cache statistics',
    category: 'performance',
  },
  'agent-actions': {
    label: 'Agent Actions',
    description: 'Tool calls, decisions, errors, and successes',
    category: 'actions',
  },
  // Node registry topics
  'dev.omninode_bridge.onex.evt.node-introspection.v1': {
    label: 'Node Introspection',
    description: 'Node introspection events for debugging and monitoring',
    category: 'introspection',
  },
  'dev.onex.evt.registration-completed.v1': {
    label: 'Registration Completed',
    description: 'Node registration completion events',
    category: 'lifecycle',
  },
  'node.heartbeat': {
    label: 'Heartbeat',
    description: 'Node health heartbeat signals',
    category: 'health',
  },
  'dev.omninode_bridge.onex.evt.registry-request-introspection.v1': {
    label: 'Registry Introspection Request',
    description: 'Introspection requests from registry to nodes',
    category: 'introspection',
  },
  // Error topics
  errors: {
    label: 'Errors',
    description: 'System errors and failures',
    category: 'error',
  },
};

/**
 * Dashboard configuration for Event Bus Monitor
 */
export const eventBusDashboardConfig: DashboardConfig = {
  dashboard_id: 'event-bus-monitor',
  name: 'Event Bus Monitor',
  description: 'Real-time Kafka event stream visualization for ONEX platform',
  theme: DashboardTheme.SYSTEM,
  layout: {
    columns: 12,
    row_height: 100,
    gap: 16,
  },
  data_source: 'websocket:event-bus',
  refresh_interval_seconds: 5,
  widgets: [
    // Row 1: Metric Cards (4 widgets)
    {
      widget_id: 'metric-total-events',
      title: 'Total Events',
      description: 'Events received in the last hour',
      row: 0,
      col: 0,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'totalEvents',
        label: 'Total Events',
        value_format: 'number',
        precision: 0,
        icon: 'activity',
      },
    },
    {
      widget_id: 'metric-throughput',
      title: 'Events/Second',
      description: 'Current event throughput rate',
      row: 0,
      col: 3,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'eventsPerSecond',
        label: 'Throughput',
        value_format: 'number',
        precision: 1,
        icon: 'zap',
        thresholds: [
          { value: 100, severity: 'warning', label: 'High volume' },
          { value: 500, severity: 'error', label: 'Very high volume' },
        ],
      },
    },
    {
      widget_id: 'metric-error-rate',
      title: 'Error Rate',
      description: 'Percentage of events sent to DLQ',
      row: 0,
      col: 6,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'errorRate',
        label: 'Error Rate',
        value_format: 'percent',
        precision: 2,
        icon: 'alert-triangle',
        thresholds: [
          { value: 5, severity: 'warning', label: 'Elevated errors' },
          { value: 10, severity: 'error', label: 'High error rate' },
          { value: 25, severity: 'critical', label: 'Critical error rate' },
        ],
      },
    },
    {
      widget_id: 'metric-active-topics',
      title: 'Active Topics',
      description: 'Number of topics with recent activity',
      row: 0,
      col: 9,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'activeTopics',
        label: 'Active Topics',
        value_format: 'number',
        precision: 0,
        icon: 'database',
      },
    },

    // Row 2: Charts (2 widgets)
    {
      widget_id: 'chart-volume-timeline',
      title: 'Event Volume Over Time',
      description: 'Events per minute by topic',
      row: 1,
      col: 0,
      width: 6,
      height: 2,
      config: {
        config_kind: 'chart',
        chart_type: 'area',
        series: [
          { name: 'Introspection', data_key: 'introspectionEvents' },
          { name: 'Registration', data_key: 'registrationEvents' },
          { name: 'Heartbeat', data_key: 'heartbeatEvents' },
          { name: 'DLQ', data_key: 'dlqEvents' },
        ],
        stacked: true,
        show_legend: true,
        x_axis: { label: 'Time', show_grid: true },
        y_axis: { label: 'Events/min', min_value: 0 },
      },
    },
    {
      widget_id: 'chart-topic-breakdown',
      title: 'Events by Topic',
      description: 'Distribution of events across topics',
      row: 1,
      col: 6,
      width: 6,
      height: 2,
      config: {
        config_kind: 'chart',
        chart_type: 'bar',
        series: [{ name: 'Events', data_key: 'eventCount' }],
        show_legend: false,
        x_axis: { show_grid: false },
        y_axis: { label: 'Count', min_value: 0 },
      },
    },

    // Row 3: Table and Event Feed (2 widgets)
    {
      widget_id: 'table-recent-events',
      title: 'Recent Events',
      description: 'Latest events from all topics',
      row: 3,
      col: 0,
      width: 6,
      height: 3,
      config: {
        config_kind: 'table',
        rows_key: 'recentEvents',
        page_size: 10,
        show_pagination: true,
        default_sort_key: 'timestamp',
        default_sort_direction: 'desc',
        striped: true,
        hover_highlight: true,
        columns: [
          { key: 'topic', header: 'Topic', width: 200, sortable: true },
          { key: 'eventType', header: 'Event Type', width: 150, sortable: true },
          { key: 'source', header: 'Source', width: 120, sortable: true },
          { key: 'timestamp', header: 'Time', width: 100, sortable: true, format: 'datetime' },
          { key: 'priority', header: 'Priority', width: 80, sortable: true, format: 'badge' },
        ],
      },
    },
    {
      widget_id: 'feed-live-events',
      title: 'Live Event Stream',
      description: 'Real-time event feed with filtering',
      row: 3,
      col: 6,
      width: 6,
      height: 3,
      config: {
        config_kind: 'event_feed',
        events_key: 'liveEvents',
        max_items: 50,
        show_timestamp: true,
        show_source: true,
        show_severity: true,
        auto_scroll: true,
      },
    },

    // Row 4: Status Grid (1 widget)
    {
      widget_id: 'status-topic-health',
      title: 'Topic Health',
      description: 'Health status of monitored topics',
      row: 6,
      col: 0,
      width: 12,
      height: 1,
      config: {
        config_kind: 'status_grid',
        items_key: 'topicHealth',
        id_field: 'topicId',
        label_field: 'topicName',
        status_field: 'status',
        columns: 5,
        show_labels: true,
        compact: false,
      },
    },
  ],
};

/**
 * Generate mock data for the Event Bus Monitor dashboard
 * Used for development and demonstration purposes
 */
export function generateEventBusMockData(): Record<string, unknown> {
  const now = new Date();

  // Generate time series data for charts
  const timeSeriesData = Array.from({ length: 30 }, (_, i) => {
    const timestamp = new Date(now.getTime() - (29 - i) * 60000);
    return {
      name: timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      timestamp: timestamp.toISOString(),
      introspectionEvents: Math.floor(Math.random() * 50) + 10,
      registrationEvents: Math.floor(Math.random() * 20) + 5,
      heartbeatEvents: Math.floor(Math.random() * 100) + 50,
      dlqEvents: Math.floor(Math.random() * 5),
    };
  });

  // Generate topic breakdown data
  const topicBreakdownData = MONITORED_TOPICS.map((topic) => ({
    name: TOPIC_METADATA[topic]?.label || topic,
    topic,
    eventCount:
      topic === 'node.heartbeat'
        ? Math.floor(Math.random() * 500) + 200
        : topic === 'agent-actions'
          ? Math.floor(Math.random() * 300) + 100
          : topic === 'agent-routing-decisions'
            ? Math.floor(Math.random() * 150) + 50
            : Math.floor(Math.random() * 100) + 30,
  }));

  // Calculate totals
  const totalEvents = topicBreakdownData.reduce((sum, t) => sum + t.eventCount, 0);
  const errorCount = Math.floor(totalEvents * 0.02); // ~2% error rate
  const errorRate = totalEvents > 0 ? (errorCount / totalEvents) * 100 : 0;

  // Generate recent events for table
  const recentEvents = Array.from({ length: 50 }, (_, i) => {
    const topicIndex = Math.floor(Math.random() * MONITORED_TOPICS.length);
    const topic = MONITORED_TOPICS[topicIndex];
    const eventTimestamp = new Date(now.getTime() - i * 5000);
    const priorities: Array<'low' | 'normal' | 'high' | 'critical'> = [
      'low',
      'normal',
      'normal',
      'normal',
      'high',
      'critical',
    ];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];

    return {
      id: `evt-${i}-${Date.now()}`,
      topic: TOPIC_METADATA[topic]?.label || topic,
      topicRaw: topic,
      eventType: getEventTypeForTopic(topic),
      source: getRandomSource(),
      timestamp: eventTimestamp.toISOString(),
      priority,
      correlationId: generateCorrelationId(),
      payload: generatePayloadPreview(topic),
    };
  });

  // Generate live events for feed
  const liveEvents = recentEvents.slice(0, 20).map((event) => ({
    id: event.id,
    timestamp: event.timestamp,
    type: mapPriorityToSeverity(event.priority),
    severity: mapPriorityToSeverity(event.priority),
    message: `${event.eventType} from ${event.source}`,
    source: event.topicRaw,
  }));

  // Generate topic health status
  const topicHealth = MONITORED_TOPICS.map((topic) => {
    const eventCount = topicBreakdownData.find((t) => t.topic === topic)?.eventCount || 0;
    let status: string;

    if (topic === 'node.heartbeat' || topic === 'agent-actions') {
      status = eventCount > 100 ? 'healthy' : eventCount > 50 ? 'warning' : 'error';
    } else if (topic === 'agent-routing-decisions') {
      status = eventCount > 50 ? 'healthy' : eventCount > 20 ? 'warning' : 'offline';
    } else {
      status = eventCount > 10 ? 'healthy' : eventCount > 0 ? 'warning' : 'offline';
    }

    return {
      topicId: topic,
      topicName: TOPIC_METADATA[topic]?.label || topic,
      status,
      eventCount,
      lastEventTime: new Date(now.getTime() - Math.random() * 60000).toISOString(),
    };
  });

  return {
    // Metrics
    totalEvents,
    eventsPerSecond: Math.round((totalEvents / 3600) * 10) / 10,
    errorRate: Math.round(errorRate * 100) / 100,
    activeTopics: topicHealth.filter((t) => t.status !== 'offline').length,

    // Chart data
    timeSeriesData,
    topicBreakdownData,

    // Table data
    recentEvents,

    // Event feed
    liveEvents,

    // Status grid
    topicHealth,
  };
}

// Helper functions for mock data generation

function getEventTypeForTopic(topic: string): string {
  const eventTypes: Record<string, string[]> = {
    // Agent topics
    'agent-routing-decisions': ['routing.decision', 'agent.selected', 'confidence.evaluated'],
    'agent-transformation-events': [
      'transformation.started',
      'transformation.completed',
      'agent.transformed',
    ],
    'router-performance-metrics': ['cache.hit', 'cache.miss', 'routing.timed'],
    'agent-actions': ['tool.called', 'decision.made', 'action.completed', 'error.occurred'],
    // Node topics
    'dev.omninode_bridge.onex.evt.node-introspection.v1': [
      'node.introspected',
      'node.capabilities.discovered',
      'node.schema.extracted',
    ],
    'dev.onex.evt.registration-completed.v1': [
      'node.registered',
      'node.validated',
      'node.activated',
    ],
    'node.heartbeat': ['heartbeat.ping', 'heartbeat.pong', 'health.check'],
    'dev.omninode_bridge.onex.evt.registry-request-introspection.v1': [
      'introspection.requested',
      'registry.polling',
      'node.discovery',
    ],
  };

  const types = eventTypes[topic] || ['event.unknown'];
  return types[Math.floor(Math.random() * types.length)];
}

function getRandomSource(): string {
  const sources = [
    'node-registry',
    'orchestrator',
    'validator',
    'scheduler',
    'api-gateway',
    'event-processor',
    'introspection-service',
  ];
  return sources[Math.floor(Math.random() * sources.length)];
}

function generateCorrelationId(): string {
  return `corr-${Math.random().toString(36).substring(2, 10)}`;
}

function generatePayloadPreview(topic: string): string {
  const previews: Record<string, string[]> = {
    // Agent topics
    'agent-routing-decisions': [
      '{"selected_agent": "api-architect", "confidence": 0.95}',
      '{"routing_time_ms": 45, "strategy": "keyword"}',
    ],
    'agent-transformation-events': [
      '{"source": "polymorphic", "target": "api-architect"}',
      '{"transformation_duration_ms": 120, "success": true}',
    ],
    'router-performance-metrics': [
      '{"cache_hit": true, "candidates_evaluated": 5}',
      '{"routing_duration_ms": 23, "strategy": "semantic"}',
    ],
    'agent-actions': [
      '{"action_type": "tool_call", "tool": "Read"}',
      '{"action_type": "decision", "agent": "debug"}',
    ],
    // Node topics
    'dev.omninode_bridge.onex.evt.node-introspection.v1': [
      '{"node_id": "node-123", "capabilities": [...]}',
      '{"schema_version": "1.0", "fields": [...]}',
    ],
    'dev.onex.evt.registration-completed.v1': [
      '{"node_id": "node-456", "status": "active"}',
      '{"registration_id": "reg-789"}',
    ],
    'node.heartbeat': ['{"node_id": "node-123", "uptime": 3600}', '{"status": "healthy"}'],
    'dev.omninode_bridge.onex.evt.registry-request-introspection.v1': [
      '{"node_id": "node-789", "request_type": "introspection"}',
      '{"registry_id": "reg-001", "target_nodes": [...]}',
    ],
  };

  const options = previews[topic] || ['{"event": "unknown"}'];
  return options[Math.floor(Math.random() * options.length)];
}

function mapPriorityToSeverity(priority: string): 'info' | 'success' | 'warning' | 'error' {
  switch (priority) {
    case 'critical':
      return 'error';
    case 'high':
      return 'warning';
    case 'normal':
      return 'info';
    case 'low':
      return 'success';
    default:
      return 'info';
  }
}
