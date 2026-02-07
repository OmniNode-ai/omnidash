/**
 * Event Bus Monitor Dashboard Configuration
 *
 * Real-time Kafka event stream visualization dashboard.
 * Monitors agent and ONEX event topics via WebSocket connection to server.
 *
 * Topic constants imported from @shared/topics (single source of truth).
 */

import type { DashboardConfig } from '@/lib/dashboard-schema';
import { DashboardTheme } from '@/lib/dashboard-schema';
import {
  LEGACY_AGENT_ROUTING_DECISIONS,
  LEGACY_AGENT_TRANSFORMATION_EVENTS,
  LEGACY_ROUTER_PERFORMANCE_METRICS,
  LEGACY_AGENT_ACTIONS,
  LEGACY_AGENT_MANIFEST_INJECTIONS,
  SUFFIX_NODE_INTROSPECTION,
  SUFFIX_NODE_REGISTRATION,
  SUFFIX_NODE_HEARTBEAT,
  SUFFIX_REQUEST_INTROSPECTION,
  SUFFIX_CONTRACT_REGISTERED,
  SUFFIX_CONTRACT_DEREGISTERED,
  SUFFIX_NODE_REGISTRATION_INITIATED,
  SUFFIX_NODE_REGISTRATION_ACCEPTED,
  SUFFIX_NODE_REGISTRATION_REJECTED,
  SUFFIX_REGISTRATION_SNAPSHOTS,
  SUFFIX_OMNICLAUDE_TOOL_EXECUTED,
  SUFFIX_OMNICLAUDE_PROMPT_SUBMITTED,
  SUFFIX_OMNICLAUDE_SESSION_STARTED,
  SUFFIX_OMNICLAUDE_SESSION_ENDED,
  SUFFIX_INTELLIGENCE_PATTERN_SCORED,
  SUFFIX_INTELLIGENCE_PATTERN_DISCOVERED,
  SUFFIX_INTELLIGENCE_PATTERN_LEARNED,
  ENVIRONMENT_PREFIXES,
} from '@shared/topics';

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
// Topic Constants
// ============================================================================

/**
 * Agent topics - core agent functionality events (legacy flat names)
 */
export const AGENT_TOPICS = [
  LEGACY_AGENT_ROUTING_DECISIONS,
  LEGACY_AGENT_TRANSFORMATION_EVENTS,
  LEGACY_ROUTER_PERFORMANCE_METRICS,
  LEGACY_AGENT_ACTIONS,
] as const;

/**
 * Node registry topics - canonical ONEX suffixes for node lifecycle and health
 */
export const NODE_TOPICS = [
  SUFFIX_NODE_INTROSPECTION,
  SUFFIX_NODE_REGISTRATION,
  SUFFIX_NODE_HEARTBEAT,
  SUFFIX_REQUEST_INTROSPECTION,
  SUFFIX_CONTRACT_REGISTERED,
  SUFFIX_CONTRACT_DEREGISTERED,
  SUFFIX_NODE_REGISTRATION_INITIATED,
  SUFFIX_NODE_REGISTRATION_ACCEPTED,
  SUFFIX_NODE_REGISTRATION_REJECTED,
  SUFFIX_REGISTRATION_SNAPSHOTS,
] as const;

/**
 * All monitored topics combined
 */
export const MONITORED_TOPICS = [...AGENT_TOPICS, ...NODE_TOPICS] as const;

export type AgentTopic = (typeof AGENT_TOPICS)[number];
export type NodeTopic = (typeof NODE_TOPICS)[number];
export type MonitoredTopic = (typeof MONITORED_TOPICS)[number];

// ============================================================================
// Topic Metadata (contract-driven, also available in dashboard config)
// ============================================================================

/**
 * Topic metadata for display labels and categorization
 */
export const TOPIC_METADATA: Record<
  string,
  { label: string; description: string; category: string }
> = {
  // Agent topics (legacy flat names)
  [LEGACY_AGENT_ROUTING_DECISIONS]: {
    label: 'Routing Decisions',
    description: 'Agent selection and routing decisions with confidence scores',
    category: 'routing',
  },
  [LEGACY_AGENT_TRANSFORMATION_EVENTS]: {
    label: 'Transformations',
    description: 'Polymorphic agent transformation events',
    category: 'transformation',
  },
  [LEGACY_ROUTER_PERFORMANCE_METRICS]: {
    label: 'Performance',
    description: 'Routing performance metrics and cache statistics',
    category: 'performance',
  },
  [LEGACY_AGENT_ACTIONS]: {
    label: 'Agent Actions',
    description: 'Tool calls, decisions, errors, and successes',
    category: 'actions',
  },
  // Node registry topics (canonical ONEX suffixes)
  [SUFFIX_NODE_INTROSPECTION]: {
    label: 'Node Introspection',
    description: 'Node introspection events for debugging and monitoring',
    category: 'introspection',
  },
  [SUFFIX_NODE_REGISTRATION]: {
    label: 'Node Registration',
    description: 'Node registration lifecycle events',
    category: 'lifecycle',
  },
  [SUFFIX_NODE_HEARTBEAT]: {
    label: 'Heartbeat',
    description: 'Node health heartbeat signals',
    category: 'health',
  },
  [SUFFIX_REQUEST_INTROSPECTION]: {
    label: 'Registry Introspection Request',
    description: 'Introspection requests from registry to nodes',
    category: 'introspection',
  },
  [SUFFIX_CONTRACT_REGISTERED]: {
    label: 'Contract Registered',
    description: 'Contract registration events',
    category: 'lifecycle',
  },
  [SUFFIX_CONTRACT_DEREGISTERED]: {
    label: 'Contract Deregistered',
    description: 'Contract deregistration events',
    category: 'lifecycle',
  },
  [SUFFIX_NODE_REGISTRATION_INITIATED]: {
    label: 'Registration Initiated',
    description: 'Node registration initiation events',
    category: 'lifecycle',
  },
  [SUFFIX_NODE_REGISTRATION_ACCEPTED]: {
    label: 'Registration Accepted',
    description: 'Node registration acceptance events',
    category: 'lifecycle',
  },
  [SUFFIX_NODE_REGISTRATION_REJECTED]: {
    label: 'Registration Rejected',
    description: 'Node registration rejection events',
    category: 'lifecycle',
  },
  [SUFFIX_REGISTRATION_SNAPSHOTS]: {
    label: 'Registration Snapshots',
    description: 'Point-in-time registration state snapshots',
    category: 'snapshot',
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
    // Agent topics (legacy flat names)
    [LEGACY_AGENT_ROUTING_DECISIONS]: {
      label: 'Routing Decisions',
      description: 'Agent selection and routing decisions with confidence scores',
      category: 'routing',
    },
    [LEGACY_AGENT_TRANSFORMATION_EVENTS]: {
      label: 'Transformations',
      description: 'Polymorphic agent transformation events',
      category: 'transformation',
    },
    [LEGACY_ROUTER_PERFORMANCE_METRICS]: {
      label: 'Performance',
      description: 'Routing performance metrics and cache statistics',
      category: 'performance',
    },
    [LEGACY_AGENT_ACTIONS]: {
      label: 'Agent Actions',
      description: 'Tool calls, decisions, errors, and successes',
      category: 'actions',
    },
    // Node registry topics (canonical ONEX suffixes)
    [SUFFIX_NODE_INTROSPECTION]: {
      label: 'Node Introspection',
      description: 'Node introspection events for debugging and monitoring',
      category: 'introspection',
    },
    [SUFFIX_NODE_REGISTRATION]: {
      label: 'Node Registration',
      description: 'Node registration lifecycle events',
      category: 'lifecycle',
    },
    [SUFFIX_NODE_HEARTBEAT]: {
      label: 'Heartbeat',
      description: 'Node health heartbeat signals',
      category: 'health',
    },
    [SUFFIX_REQUEST_INTROSPECTION]: {
      label: 'Registry Introspection Request',
      description: 'Introspection requests from registry to nodes',
      category: 'introspection',
    },
    [SUFFIX_CONTRACT_REGISTERED]: {
      label: 'Contract Registered',
      description: 'Contract registration events',
      category: 'lifecycle',
    },
    [SUFFIX_CONTRACT_DEREGISTERED]: {
      label: 'Contract Deregistered',
      description: 'Contract deregistration events',
      category: 'lifecycle',
    },
    [SUFFIX_NODE_REGISTRATION_INITIATED]: {
      label: 'Registration Initiated',
      description: 'Node registration initiation events',
      category: 'lifecycle',
    },
    [SUFFIX_NODE_REGISTRATION_ACCEPTED]: {
      label: 'Registration Accepted',
      description: 'Node registration acceptance events',
      category: 'lifecycle',
    },
    [SUFFIX_NODE_REGISTRATION_REJECTED]: {
      label: 'Registration Rejected',
      description: 'Node registration rejection events',
      category: 'lifecycle',
    },
    [SUFFIX_REGISTRATION_SNAPSHOTS]: {
      label: 'Registration Snapshots',
      description: 'Point-in-time registration state snapshots',
      category: 'snapshot',
    },
    // Error topics
    errors: {
      label: 'Errors',
      description: 'System errors and failures',
      category: 'error',
    },
  },

  // List of all monitored Kafka topics
  monitored_topics: [...AGENT_TOPICS, ...NODE_TOPICS],

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
      row: 1,
      col: 0,
      width: 8,
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
      widget_id: 'chart-event-type-breakdown',
      title: 'Events by Type',
      row: 1,
      col: 8,
      width: 4,
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
          { key: 'topic', header: 'Topic', width: 150, sortable: true },
          { key: 'eventType', header: 'Event Type', width: 130, sortable: true },
          { key: 'summary', header: 'Summary', width: 250, sortable: false },
          { key: 'source', header: 'Source', width: 120, sortable: true },
          { key: 'timestamp', header: 'Time', width: 100, sortable: true },
        ],
      },
    },
  ],
};

// ============================================================================
// Event Type Metadata
// ============================================================================

/**
 * Event type metadata for display labels.
 * Maps raw event type strings to human-readable short labels.
 */
export const EVENT_TYPE_METADATA: Record<string, { label: string; description?: string }> = {
  // Agent event types (legacy flat names)
  [LEGACY_AGENT_ROUTING_DECISIONS]: { label: 'Routing Decision' },
  [LEGACY_AGENT_MANIFEST_INJECTIONS]: { label: 'Manifest Injection' },
  [LEGACY_AGENT_TRANSFORMATION_EVENTS]: { label: 'Transformation' },
  routing: { label: 'Routing' },
  transformation: { label: 'Transformation' },
  performance: { label: 'Performance' },
  action: { label: 'Action' },
  error: { label: 'Error' },

  // Common raw event types (with underscores)
  tool_call: { label: 'Tool Call' },
  user: { label: 'User Action' },
  decision: { label: 'Decision' },
  success: { label: 'Success' },

  // Environment-only values that slip through (map to Unknown)
  dev: { label: 'Unknown Type' },
  staging: { label: 'Unknown Type' },
  prod: { label: 'Unknown Type' },
  production: { label: 'Unknown Type' },
  test: { label: 'Unknown Type' },

  // ONEX event types (canonical suffixes)
  [SUFFIX_OMNICLAUDE_TOOL_EXECUTED]: { label: 'Tool Executed' },
  [SUFFIX_OMNICLAUDE_PROMPT_SUBMITTED]: { label: 'Prompt Submitted' },
  [SUFFIX_OMNICLAUDE_SESSION_STARTED]: { label: 'Session Started' },
  [SUFFIX_OMNICLAUDE_SESSION_ENDED]: { label: 'Session Ended' },
  [SUFFIX_INTELLIGENCE_PATTERN_SCORED]: { label: 'Pattern Scored' },
  [SUFFIX_INTELLIGENCE_PATTERN_DISCOVERED]: { label: 'Pattern Discovered' },
  [SUFFIX_INTELLIGENCE_PATTERN_LEARNED]: { label: 'Pattern Learned' },

  // Node lifecycle event types
  introspection: { label: 'Introspection' },
  heartbeat: { label: 'Heartbeat' },
  state_change: { label: 'State Change' },
  registry_update: { label: 'Registry Update' },

  // Canonical event-name segments (extracted from actionName by server)
  'tool-content': { label: 'Tool Content' },
  'claude-hook-event': { label: 'Claude Hook' },
  'intent-classified': { label: 'Intent Classified' },
  'intent-stored': { label: 'Intent Stored' },
  'intent-query-response': { label: 'Intent Query' },
  'session-outcome': { label: 'Session Outcome' },
  'prompt-submitted': { label: 'Prompt Submitted' },
  'session-started': { label: 'Session Started' },
  'session-ended': { label: 'Session Ended' },
  'tool-executed': { label: 'Tool Executed' },
};

/** Structural segments to skip (not meaningful for display) */
const STRUCTURAL_SEGMENTS = ['evt', 'event', 'events', 'onex', 'omninode_bridge'];

/**
 * Convert a kebab-case or snake_case string to Title Case.
 * @example "tool-executed" → "Tool Executed"
 * @example "pattern_scored" → "Pattern Scored"
 */
function toTitleCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Extract a short label from an ONEX-style event type string.
 *
 * Patterns supported:
 * - {env}.[namespace].evt.[source].[action].v[N] → "Action"
 * - {env}.[namespace].onex.evt.[action].v[N] → "Action"
 * - Simple strings like "tool_call" → "Tool Call"
 *
 * Skips environment prefixes (dev, staging, prod) and structural segments (evt, onex).
 */
const _envPrefixPattern = ENVIRONMENT_PREFIXES.join('|');
const _onexRegex = new RegExp(`^(?:${_envPrefixPattern})\\.[^.]+\\.evt\\.[^.]+\\.([^.]+)\\.v\\d+$`);
const _onexAltRegex = new RegExp(
  `^(?:${_envPrefixPattern})\\.[^.]+\\.onex\\.evt\\.([^.]+)\\.v\\d+$`
);

function extractEventTypeLabel(eventType: string): string {
  // Pattern: {env}.*.evt.*.[action].v[N]
  const match = eventType.match(_onexRegex);

  if (match) {
    return toTitleCase(match[1]);
  }

  // Alternative pattern: {env}.*.onex.evt.[action].v[N]
  const altMatch = eventType.match(_onexAltRegex);
  if (altMatch) {
    return toTitleCase(altMatch[1]);
  }

  // Split and filter out non-meaningful segments
  const segments = eventType.split('.');
  const meaningfulSegments = segments.filter((seg) => {
    const lower = seg.toLowerCase();
    // Skip environment prefixes
    if ((ENVIRONMENT_PREFIXES as readonly string[]).includes(lower)) return false;
    // Skip structural segments
    if (STRUCTURAL_SEGMENTS.includes(lower)) return false;
    // Skip version suffixes (v1, v2, etc.)
    if (/^v\d+$/.test(lower)) return false;
    // Skip empty segments
    if (!seg.trim()) return false;
    return true;
  });

  // Take the last meaningful segment (usually the action)
  if (meaningfulSegments.length > 0) {
    const lastSegment = meaningfulSegments[meaningfulSegments.length - 1];
    return toTitleCase(lastSegment);
  }

  // Ultimate fallback: return as-is but truncated
  return eventType.length > 25 ? eventType.slice(0, 22) + '...' : eventType;
}

/**
 * Get the label for an event type, with fallback to extracted label.
 */
export function getEventTypeLabel(eventType: string): string {
  return EVENT_TYPE_METADATA[eventType]?.label ?? extractEventTypeLabel(eventType);
}

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
 * Falls back to the TOPIC_METADATA constant for completeness.
 *
 * Handles env-prefixed topic names (e.g. 'dev.onex.evt.platform.node-introspection.v1')
 * by stripping the leading env segment and retrying against suffix-keyed metadata.
 */
export function getTopicMetadata(
  topic: string
): { label: string; description: string; category: string } | undefined {
  // Direct lookup first (handles legacy flat names and exact suffix matches)
  const direct = eventBusDashboardConfig.topic_metadata?.[topic] ?? TOPIC_METADATA[topic];
  if (direct) return direct;

  // Try suffix extraction for env-prefixed topics (e.g., 'dev.onex.evt...' -> 'onex.evt...')
  const suffixMatch = topic.match(/^[^.]+\.(.+)$/);
  if (suffixMatch) {
    const suffix = suffixMatch[1];
    return eventBusDashboardConfig.topic_metadata?.[suffix] ?? TOPIC_METADATA[suffix];
  }

  return undefined;
}

/**
 * Get the label for a topic, with fallback to the topic name itself.
 */
export function getTopicLabel(topic: string): string {
  return getTopicMetadata(topic)?.label ?? topic;
}

/**
 * Get all monitored topics from the config.
 * Falls back to the MONITORED_TOPICS constant for completeness.
 */
export function getMonitoredTopics(): readonly string[] {
  return eventBusDashboardConfig.monitored_topics ?? MONITORED_TOPICS;
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

  // Generate topic breakdown data
  const topicBreakdownData = MONITORED_TOPICS.map((topic) => ({
    name: TOPIC_METADATA[topic]?.label || topic,
    topic,
    eventCount:
      topic === SUFFIX_NODE_HEARTBEAT
        ? Math.floor(Math.random() * 500) + 200
        : topic === LEGACY_AGENT_ACTIONS
          ? Math.floor(Math.random() * 300) + 100
          : topic === LEGACY_AGENT_ROUTING_DECISIONS
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

    if (topic === SUFFIX_NODE_HEARTBEAT || topic === LEGACY_AGENT_ACTIONS) {
      status = eventCount > 100 ? 'healthy' : eventCount > 50 ? 'warning' : 'error';
    } else if (topic === LEGACY_AGENT_ROUTING_DECISIONS) {
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
    [LEGACY_AGENT_ROUTING_DECISIONS]: [
      'routing.decision',
      'agent.selected',
      'confidence.evaluated',
    ],
    [LEGACY_AGENT_TRANSFORMATION_EVENTS]: [
      'transformation.started',
      'transformation.completed',
      'agent.transformed',
    ],
    [LEGACY_ROUTER_PERFORMANCE_METRICS]: ['cache.hit', 'cache.miss', 'routing.timed'],
    [LEGACY_AGENT_ACTIONS]: ['tool.called', 'decision.made', 'action.completed', 'error.occurred'],
    // Node topics (canonical ONEX suffixes)
    [SUFFIX_NODE_INTROSPECTION]: [
      'node.introspected',
      'node.capabilities.discovered',
      'node.schema.extracted',
    ],
    [SUFFIX_NODE_REGISTRATION]: ['node.registered', 'node.validated', 'node.activated'],
    [SUFFIX_NODE_HEARTBEAT]: ['heartbeat.ping', 'heartbeat.pong', 'health.check'],
    [SUFFIX_REQUEST_INTROSPECTION]: [
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
    [LEGACY_AGENT_ROUTING_DECISIONS]: [
      '{"selected_agent": "api-architect", "confidence": 0.95}',
      '{"routing_time_ms": 45, "strategy": "keyword"}',
    ],
    [LEGACY_AGENT_TRANSFORMATION_EVENTS]: [
      '{"source": "polymorphic", "target": "api-architect"}',
      '{"transformation_duration_ms": 120, "success": true}',
    ],
    [LEGACY_ROUTER_PERFORMANCE_METRICS]: [
      '{"cache_hit": true, "candidates_evaluated": 5}',
      '{"routing_duration_ms": 23, "strategy": "semantic"}',
    ],
    [LEGACY_AGENT_ACTIONS]: [
      '{"action_type": "tool_call", "tool": "Read"}',
      '{"action_type": "decision", "agent": "debug"}',
    ],
    // Node topics (canonical ONEX suffixes)
    [SUFFIX_NODE_INTROSPECTION]: [
      '{"node_id": "node-123", "capabilities": [...]}',
      '{"schema_version": "1.0", "fields": [...]}',
    ],
    [SUFFIX_NODE_REGISTRATION]: [
      '{"node_id": "node-456", "status": "active"}',
      '{"registration_id": "reg-789"}',
    ],
    [SUFFIX_NODE_HEARTBEAT]: ['{"node_id": "node-123", "uptime": 3600}', '{"status": "healthy"}'],
    [SUFFIX_REQUEST_INTROSPECTION]: [
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
