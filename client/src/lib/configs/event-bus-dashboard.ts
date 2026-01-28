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

// ============================================================================
// Deprecation Warning System (Development Only)
// ============================================================================

/**
 * Tracks which deprecation warnings have already been shown.
 * Prevents console spam by only warning once per export.
 */
const warnedDeprecations = new Set<string>();

/**
 * Logs a deprecation warning in development mode.
 * Only warns once per export name to avoid console spam.
 *
 * @param name - The deprecated export name
 * @param replacement - The recommended replacement API
 */
function warnDeprecated(name: string, replacement: string): void {
  if (import.meta.env?.DEV && !warnedDeprecations.has(name)) {
    warnedDeprecations.add(name);
    console.warn(
      `[Deprecated] "${name}" is deprecated and will be removed in a future release. ` +
        `Use "${replacement}" instead. ` +
        `See eventBusDashboardConfig for the canonical configuration.`
    );
  }
}

/**
 * Creates a proxy that warns on first access of a deprecated export.
 * The proxy is transparent - it behaves exactly like the original value.
 *
 * @param value - The original value to wrap
 * @param name - The deprecated export name (for warning message)
 * @param replacement - The recommended replacement API
 */
function createDeprecatedProxy<T extends object>(value: T, name: string, replacement: string): T {
  let hasWarned = false;

  return new Proxy(value, {
    get(target, prop, receiver) {
      if (!hasWarned) {
        warnDeprecated(name, replacement);
        hasWarned = true;
      }
      return Reflect.get(target, prop, receiver);
    },
    // Support array iteration (for...of, spread, etc.)
    ownKeys(target) {
      if (!hasWarned) {
        warnDeprecated(name, replacement);
        hasWarned = true;
      }
      return Reflect.ownKeys(target);
    },
  });
}

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

// ============================================================================
// Topic Constants (for backwards compatibility and type safety)
// ============================================================================

/**
 * Agent topics - core agent functionality events (internal, unwrapped)
 * @internal
 */
const _AGENT_TOPICS = [
  'agent-routing-decisions',
  'agent-transformation-events',
  'router-performance-metrics',
  'agent-actions',
] as const;

/**
 * Agent topics - core agent functionality events
 * @deprecated Use eventBusDashboardConfig.monitored_topics instead for runtime access.
 *             This export triggers a console warning in development mode.
 */
export const AGENT_TOPICS = createDeprecatedProxy(
  _AGENT_TOPICS,
  'AGENT_TOPICS',
  'eventBusDashboardConfig.monitored_topics'
);

/**
 * Node registry topics - node lifecycle and health events (internal, unwrapped)
 * @internal
 */
const _NODE_TOPICS = [
  'dev.omninode_bridge.onex.evt.node-introspection.v1',
  'dev.onex.evt.registration-completed.v1',
  'node.heartbeat',
  'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
] as const;

/**
 * Node registry topics - node lifecycle and health events
 * @deprecated Use eventBusDashboardConfig.monitored_topics instead for runtime access.
 *             This export triggers a console warning in development mode.
 */
export const NODE_TOPICS = createDeprecatedProxy(
  _NODE_TOPICS,
  'NODE_TOPICS',
  'eventBusDashboardConfig.monitored_topics'
);

/**
 * All monitored topics combined (internal, unwrapped)
 * @internal
 */
const _MONITORED_TOPICS = [..._AGENT_TOPICS, ..._NODE_TOPICS] as const;

/**
 * All monitored topics combined
 * @deprecated Use eventBusDashboardConfig.monitored_topics instead for runtime access.
 *             This export triggers a console warning in development mode.
 */
export const MONITORED_TOPICS = createDeprecatedProxy(
  _MONITORED_TOPICS,
  'MONITORED_TOPICS',
  'eventBusDashboardConfig.monitored_topics'
);

export type AgentTopic = (typeof AGENT_TOPICS)[number];
export type NodeTopic = (typeof NODE_TOPICS)[number];
export type MonitoredTopic = (typeof MONITORED_TOPICS)[number];

// ============================================================================
// Topic Metadata (contract-driven, now part of dashboard config)
// ============================================================================

/**
 * Topic metadata for display (internal, unwrapped)
 * @internal
 */
const _TOPIC_METADATA: Record<string, { label: string; description: string; category: string }> = {
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
 * Topic metadata for display
 * @deprecated Use eventBusDashboardConfig.topic_metadata instead for runtime access.
 *             This export triggers a console warning in development mode.
 */
export const TOPIC_METADATA = createDeprecatedProxy(
  _TOPIC_METADATA,
  'TOPIC_METADATA',
  'eventBusDashboardConfig.topic_metadata'
);

/**
 * Dashboard configuration for Event Bus Monitor
 *
 * Contract-driven configuration including:
 * - runtime_config: Tunable parameters for event monitoring behavior
 * - topic_metadata: Display metadata for all monitored topics
 * - monitored_topics: List of Kafka topics to monitor
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

  // Runtime configuration for event monitoring behavior
  runtime_config: {
    event_monitoring: {
      max_events: 50,
      max_events_options: [50, 100, 200, 500, 1000],
      throughput_cleanup_interval: 100,
      time_series_window_ms: 5 * 60 * 1000, // 5 minutes
      throughput_window_ms: 60 * 1000, // 1 minute
      max_breakdown_items: 50,
      periodic_cleanup_interval_ms: 10 * 1000, // 10 seconds - for responsive UX
    },
  },

  // Topic metadata for display labels and categorization
  topic_metadata: {
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
  },

  // List of all monitored Kafka topics
  monitored_topics: [
    // Agent topics
    'agent-routing-decisions',
    'agent-transformation-events',
    'router-performance-metrics',
    'agent-actions',
    // Node registry topics
    'dev.omninode_bridge.onex.evt.node-introspection.v1',
    'dev.onex.evt.registration-completed.v1',
    'node.heartbeat',
    'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
  ],

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
      title: 'Events/sec',
      description: 'Events received per second (60-second sliding window)',
      row: 0,
      col: 3,
      width: 3,
      height: 1,
      config: {
        config_kind: 'metric_card',
        metric_key: 'eventsPerSecond',
        label: 'Events/sec',
        value_format: 'number',
        precision: 1,
        icon: 'zap',
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

    // Row 1-2: Charts
    {
      widget_id: 'chart-volume-timeline',
      title: 'Event Volume Over Time',
      description: 'Events per 10-second interval',
      row: 1,
      col: 0,
      width: 6,
      height: 2,
      config: {
        config_kind: 'chart',
        chart_type: 'area',
        data_key: 'timeSeriesData',
        series: [{ name: 'Events', data_key: 'events' }],
        stacked: false,
        show_legend: false,
        x_axis: { label: 'Time', show_grid: true },
        y_axis: { label: 'Count', min_value: 0 },
      },
    },
    {
      widget_id: 'chart-topic-breakdown',
      title: 'Events by Topic',
      description: 'Distribution of events across topics',
      row: 1,
      col: 6,
      width: 3,
      height: 2,
      config: {
        config_kind: 'chart',
        chart_type: 'donut',
        alternate_chart_type: 'bar',
        data_key: 'topicBreakdownData',
        series: [{ name: 'Events', data_key: 'eventCount' }],
        show_legend: true,
        max_items: 7,
      },
    },
    {
      widget_id: 'chart-event-type-breakdown',
      title: 'Events by Type',
      description: 'Distribution of event types',
      row: 1,
      col: 9,
      width: 3,
      height: 2,
      config: {
        config_kind: 'chart',
        chart_type: 'donut',
        alternate_chart_type: 'bar',
        data_key: 'eventTypeBreakdownData',
        series: [{ name: 'Events', data_key: 'eventCount' }],
        show_legend: true,
        max_items: 7,
      },
    },

    // Row 3-5: Event Table (full width)
    {
      widget_id: 'table-recent-events',
      title: 'Recent Events',
      description: 'Latest events from all topics',
      row: 3,
      col: 0,
      width: 12,
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
  ],
};

// ============================================================================
// Config Accessor Functions
// ============================================================================

/**
 * Get event monitoring runtime configuration with defaults.
 * Use this instead of directly accessing config.runtime_config.event_monitoring
 * to ensure all fields have values.
 */
export function getEventMonitoringConfig() {
  const config = eventBusDashboardConfig.runtime_config?.event_monitoring;
  return {
    max_events: config?.max_events ?? 50,
    max_events_options: config?.max_events_options ?? [50, 100, 200, 500, 1000],
    throughput_cleanup_interval: config?.throughput_cleanup_interval ?? 100,
    time_series_window_ms: config?.time_series_window_ms ?? 5 * 60 * 1000,
    throughput_window_ms: config?.throughput_window_ms ?? 60 * 1000,
    max_breakdown_items: config?.max_breakdown_items ?? 50,
    periodic_cleanup_interval_ms: config?.periodic_cleanup_interval_ms ?? 10 * 1000,
  };
}

/**
 * Get topic metadata from the config.
 * Falls back to the legacy TOPIC_METADATA constant for backwards compatibility.
 */
export function getTopicMetadata(
  topic: string
): { label: string; description: string; category: string } | undefined {
  // Use internal _TOPIC_METADATA to avoid triggering deprecation warning
  return eventBusDashboardConfig.topic_metadata?.[topic] ?? _TOPIC_METADATA[topic];
}

/**
 * Get the label for a topic, with fallback to the topic name itself.
 */
export function getTopicLabel(topic: string): string {
  return getTopicMetadata(topic)?.label ?? topic;
}

/**
 * Get all monitored topics from the config.
 * Falls back to the legacy MONITORED_TOPICS constant for backwards compatibility.
 */
export function getMonitoredTopics(): readonly string[] {
  // Use internal _MONITORED_TOPICS to avoid triggering deprecation warning
  return eventBusDashboardConfig.monitored_topics ?? _MONITORED_TOPICS;
}

// ============================================================================
// Mock Data Generation
// ============================================================================

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

  // Generate topic breakdown data (use internal constants to avoid deprecation warnings)
  const topicBreakdownData = _MONITORED_TOPICS.map((topic) => ({
    name: _TOPIC_METADATA[topic]?.label || topic,
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

  // Generate recent events for table (use internal constants to avoid deprecation warnings)
  const recentEvents = Array.from({ length: 50 }, (_, i) => {
    const topicIndex = Math.floor(Math.random() * _MONITORED_TOPICS.length);
    const topic = _MONITORED_TOPICS[topicIndex];
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
      topic: _TOPIC_METADATA[topic]?.label || topic,
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

  // Generate topic health status (use internal constants to avoid deprecation warnings)
  const topicHealth = _MONITORED_TOPICS.map((topic) => {
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
      topicName: _TOPIC_METADATA[topic]?.label || topic,
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
