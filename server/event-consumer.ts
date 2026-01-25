import { Kafka, Consumer, KafkaMessage } from 'kafkajs';
import { EventEmitter } from 'events';
import { getIntelligenceDb } from './storage';
import { sql } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  EventEnvelopeSchema,
  NodeBecameActivePayloadSchema,
  NodeHeartbeatPayloadSchema,
  NodeLivenessExpiredPayloadSchema,
  NodeIntrospectionPayloadSchema,
  type EventEnvelope,
  type NodeBecameActivePayload,
  type NodeHeartbeatPayload,
  type NodeLivenessExpiredPayload,
} from '@shared/schemas';

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const RETRY_BASE_DELAY_MS = isTestEnv ? 20 : 1000;
const RETRY_MAX_DELAY_MS = isTestEnv ? 200 : 30000;

/**
 * Kafka consumer configuration constants.
 * Extracted for maintainability and easy tuning.
 */
const DEFAULT_MAX_RETRY_ATTEMPTS = 5;
const SQL_PRELOAD_ACTIONS_LIMIT = 200;
const SQL_PRELOAD_METRICS_LIMIT = 100;
const PERFORMANCE_METRICS_BUFFER_SIZE = 200;

// Environment-aware ONEX topic naming
const ONEX_ENV = process.env.ONEX_ENV || 'dev';

/**
 * Generate canonical ONEX topic name for event subscriptions.
 * Format: {env}.onex.evt.{event-name}.v1
 */
function onexTopic(eventName: string): string {
  return `${ONEX_ENV}.onex.evt.${eventName}.v1`;
}

export interface AgentMetrics {
  agent: string;
  totalRequests: number;
  successRate: number | null;
  avgRoutingTime: number;
  avgConfidence: number;
  lastSeen: Date;
}

export interface AgentAction {
  id: string;
  correlationId: string;
  agentName: string;
  actionType: string;
  actionName: string;
  actionDetails?: any;
  debugMode?: boolean;
  durationMs: number;
  createdAt: Date;
}

export interface RoutingDecision {
  id: string;
  correlationId: string;
  userRequest: string;
  selectedAgent: string;
  confidenceScore: number;
  routingStrategy: string;
  alternatives?: any;
  reasoning?: string;
  routingTimeMs: number;
  createdAt: Date;
}

export interface TransformationEvent {
  id: string;
  correlationId: string;
  sourceAgent: string;
  targetAgent: string;
  transformationDurationMs: number;
  success: boolean;
  confidenceScore: number;
  createdAt: Date;
}

// Node Registry Types
export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR';

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

// Valid enum values for runtime validation
const VALID_NODE_TYPES: readonly NodeType[] = ['EFFECT', 'COMPUTE', 'REDUCER', 'ORCHESTRATOR'];
const VALID_REGISTRATION_STATES: readonly RegistrationState[] = [
  'pending_registration',
  'accepted',
  'awaiting_ack',
  'ack_received',
  'active',
  'rejected',
  'ack_timed_out',
  'liveness_expired',
];
const VALID_INTROSPECTION_REASONS: readonly IntrospectionReason[] = [
  'STARTUP',
  'HEARTBEAT',
  'REQUESTED',
];

// Runtime validation guards for enum values from external sources (e.g., Kafka)
function isValidNodeType(value: unknown): value is NodeType {
  return typeof value === 'string' && VALID_NODE_TYPES.includes(value as NodeType);
}

function isValidRegistrationState(value: unknown): value is RegistrationState {
  return (
    typeof value === 'string' && VALID_REGISTRATION_STATES.includes(value as RegistrationState)
  );
}

function isValidIntrospectionReason(value: unknown): value is IntrospectionReason {
  return (
    typeof value === 'string' && VALID_INTROSPECTION_REASONS.includes(value as IntrospectionReason)
  );
}

// Safe enum parsers with fallback defaults and logging
function parseNodeType(value: unknown, defaultValue: NodeType = 'COMPUTE'): NodeType {
  if (isValidNodeType(value)) {
    return value;
  }
  if (value !== undefined && value !== null) {
    console.warn(
      `[EventConsumer] Invalid NodeType value: "${value}", using default: "${defaultValue}"`
    );
  }
  return defaultValue;
}

function parseRegistrationState(
  value: unknown,
  defaultValue: RegistrationState = 'pending_registration'
): RegistrationState {
  if (isValidRegistrationState(value)) {
    return value;
  }
  if (value !== undefined && value !== null) {
    console.warn(
      `[EventConsumer] Invalid RegistrationState value: "${value}", using default: "${defaultValue}"`
    );
  }
  return defaultValue;
}

function parseIntrospectionReason(
  value: unknown,
  defaultValue: IntrospectionReason = 'STARTUP'
): IntrospectionReason {
  if (isValidIntrospectionReason(value)) {
    return value;
  }
  if (value !== undefined && value !== null) {
    console.warn(
      `[EventConsumer] Invalid IntrospectionReason value: "${value}", using default: "${defaultValue}"`
    );
  }
  return defaultValue;
}

export interface RegisteredNode {
  nodeId: string;
  nodeType: NodeType;
  state: RegistrationState;
  version: string;
  uptimeSeconds: number;
  lastSeen: Date;
  memoryUsageMb?: number;
  cpuUsagePercent?: number;
  endpoints?: Record<string, string>;
}

// Canonical ONEX node state for event-driven updates
export type OnexNodeState = 'PENDING' | 'ACTIVE' | 'OFFLINE';

export interface CanonicalOnexNode {
  node_id: string;
  state: OnexNodeState;
  capabilities?: Record<string, unknown>;
  activated_at?: number;
  last_heartbeat_at?: number;
  last_event_at: number;
  offline_at?: number;
}

export interface NodeIntrospectionEvent {
  id: string;
  nodeId: string;
  nodeType: NodeType;
  nodeVersion: string;
  endpoints: Record<string, string>;
  currentState: RegistrationState;
  reason: IntrospectionReason;
  correlationId: string;
  createdAt: Date;
}

export interface NodeHeartbeatEvent {
  id: string;
  nodeId: string;
  uptimeSeconds: number;
  activeOperationsCount: number;
  memoryUsageMb: number;
  cpuUsagePercent: number;
  createdAt: Date;
}

export interface NodeStateChangeEvent {
  id: string;
  nodeId: string;
  previousState: RegistrationState;
  newState: RegistrationState;
  reason?: string;
  createdAt: Date;
}

// ============================================================================
// Raw Kafka Event Interfaces (snake_case from Kafka)
// These represent the exact structure of events as received from Kafka topics
// ============================================================================

/**
 * Raw routing decision event from Kafka (snake_case)
 * Topic: agent-routing-decisions
 */
export interface RawRoutingDecisionEvent {
  id?: string;
  correlation_id?: string;
  correlationId?: string; // Alternative camelCase format
  user_request?: string;
  userRequest?: string;
  selected_agent?: string;
  selectedAgent?: string;
  confidence_score?: number;
  confidenceScore?: number;
  routing_strategy?: string;
  routingStrategy?: string;
  alternatives?: Record<string, unknown>;
  reasoning?: string;
  routing_time_ms?: number;
  routingTimeMs?: number;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Raw agent action event from Kafka (snake_case)
 * Topic: agent-actions
 */
export interface RawAgentActionEvent {
  id?: string;
  correlation_id?: string;
  correlationId?: string;
  agent_name?: string;
  agentName?: string;
  action_type?: string;
  actionType?: string;
  action_name?: string;
  actionName?: string;
  action_details?: Record<string, unknown>;
  actionDetails?: Record<string, unknown>;
  debug_mode?: boolean;
  debugMode?: boolean;
  duration_ms?: number;
  durationMs?: number;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Raw transformation event from Kafka (snake_case)
 * Topic: agent-transformation-events
 */
export interface RawTransformationEvent {
  id?: string;
  correlation_id?: string;
  correlationId?: string;
  source_agent?: string;
  sourceAgent?: string;
  target_agent?: string;
  targetAgent?: string;
  transformation_duration_ms?: number;
  transformationDurationMs?: number;
  success?: boolean;
  confidence_score?: number;
  confidenceScore?: number;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Raw performance metric event from Kafka (snake_case)
 * Topic: router-performance-metrics
 */
export interface RawPerformanceMetricEvent {
  id?: string;
  correlation_id?: string;
  correlationId?: string;
  query_text?: string;
  queryText?: string;
  routing_duration_ms?: number;
  routingDurationMs?: number;
  cache_hit?: boolean;
  cacheHit?: boolean;
  candidates_evaluated?: number;
  candidatesEvaluated?: number;
  trigger_match_strategy?: string;
  triggerMatchStrategy?: string;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Raw node introspection event from Kafka (snake_case)
 * Topics: dev.omninode_bridge.onex.evt.node-introspection.v1,
 *         dev.omninode_bridge.onex.evt.registry-request-introspection.v1
 */
export interface RawNodeIntrospectionEvent {
  id?: string;
  node_id?: string;
  nodeId?: string;
  node_type?: NodeType | string;
  nodeType?: NodeType | string;
  node_version?: string;
  nodeVersion?: string;
  endpoints?: Record<string, string>;
  current_state?: RegistrationState | string;
  currentState?: RegistrationState | string;
  reason?: 'STARTUP' | 'HEARTBEAT' | 'REQUESTED' | string;
  correlation_id?: string;
  correlationId?: string;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Raw node heartbeat event from Kafka (snake_case)
 * Topic: node.heartbeat
 */
export interface RawNodeHeartbeatEvent {
  id?: string;
  node_id?: string;
  nodeId?: string;
  uptime_seconds?: number;
  uptimeSeconds?: number;
  active_operations_count?: number;
  activeOperationsCount?: number;
  memory_usage_mb?: number;
  memoryUsageMb?: number;
  cpu_usage_percent?: number;
  cpuUsagePercent?: number;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * Raw node state change event from Kafka (snake_case)
 * Topic: dev.onex.evt.registration-completed.v1
 */
export interface RawNodeStateChangeEvent {
  id?: string;
  node_id?: string;
  nodeId?: string;
  previous_state?: RegistrationState | string;
  previousState?: RegistrationState | string;
  new_state?: RegistrationState | string;
  newState?: RegistrationState | string;
  reason?: string;
  timestamp?: string;
  created_at?: string;
  createdAt?: string;
}

/**
 * EventConsumer class for aggregating Kafka events and emitting real-time updates.
 *
 * This class provides a centralized event consumption and aggregation layer for the
 * Omnidash dashboard. It connects to Kafka topics, processes incoming events, maintains
 * in-memory aggregations for quick access, and emits events for WebSocket broadcasting.
 *
 * @description
 * The EventConsumer follows a singleton pattern (via {@link getEventConsumer}) and handles:
 * - Agent routing decisions and performance metrics
 * - Agent actions (tool calls, decisions, errors)
 * - Agent transformations between polymorphic agents
 * - Node registry events (introspection, heartbeat, state changes)
 * - Automatic data pruning to prevent unbounded memory growth
 *
 * @extends EventEmitter
 *
 * @fires EventConsumer#metricUpdate - When agent metrics are updated
 * @fires EventConsumer#actionUpdate - When new agent action arrives
 * @fires EventConsumer#routingUpdate - When new routing decision arrives
 * @fires EventConsumer#transformationUpdate - When new transformation event arrives
 * @fires EventConsumer#performanceUpdate - When new performance metric arrives
 * @fires EventConsumer#nodeIntrospectionUpdate - When node introspection event arrives
 * @fires EventConsumer#nodeHeartbeatUpdate - When node heartbeat event arrives
 * @fires EventConsumer#nodeStateChangeUpdate - When node state change occurs
 * @fires EventConsumer#nodeRegistryUpdate - When registered nodes map is updated
 * @fires EventConsumer#error - When error occurs during processing
 * @fires EventConsumer#connected - When consumer successfully connects
 * @fires EventConsumer#disconnected - When consumer disconnects
 *
 * @example
 * ```typescript
 * const consumer = getEventConsumer();
 * if (consumer) {
 *   // Listen for metric updates
 *   consumer.on('metricUpdate', (metrics) => {
 *     console.log('Agent metrics updated:', metrics);
 *   });
 *
 *   // Start consuming events
 *   await consumer.start();
 *
 *   // Get current metrics
 *   const metrics = consumer.getAgentMetrics();
 * }
 * ```
 */
export class EventConsumer extends EventEmitter {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning = false;

  // Data retention configuration
  private readonly DATA_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly PRUNE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private pruneTimer?: NodeJS.Timeout;

  // In-memory aggregations
  private agentMetrics = new Map<
    string,
    {
      count: number;
      totalRoutingTime: number;
      totalConfidence: number;
      successCount: number;
      errorCount: number;
      lastSeen: Date;
    }
  >();

  private recentActions: AgentAction[] = [];
  private maxActions = 100;

  private routingDecisions: RoutingDecision[] = [];
  private maxDecisions = 100;

  private recentTransformations: TransformationEvent[] = [];
  private maxTransformations = 100;

  // Node registry storage
  private registeredNodes = new Map<string, RegisteredNode>();
  private readonly MAX_REGISTERED_NODES = 10000;
  private nodeIntrospectionEvents: NodeIntrospectionEvent[] = [];
  private nodeHeartbeatEvents: NodeHeartbeatEvent[] = [];
  private nodeStateChangeEvents: NodeStateChangeEvent[] = [];
  private maxNodeEvents = 100;

  // Canonical ONEX node registry (event-driven state)
  private canonicalNodes = new Map<string, CanonicalOnexNode>();

  // Deduplication cache for idempotency (max 10,000 entries)
  private processedEvents = new LRUCache<string, number>({ max: 10_000 });

  // Performance metrics storage
  private performanceMetrics: Array<{
    id: string;
    correlationId: string;
    queryText: string;
    routingDurationMs: number;
    cacheHit: boolean;
    candidatesEvaluated: number;
    triggerMatchStrategy: string;
    createdAt: Date;
  }> = [];

  // Aggregated stats for quick access
  private performanceStats = {
    totalQueries: 0,
    cacheHitCount: 0,
    avgRoutingDuration: 0,
    totalRoutingDuration: 0,
  };

  constructor() {
    super(); // Initialize EventEmitter

    // Get brokers from environment variable - required, no fallback
    const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;
    if (!brokers) {
      throw new Error(
        'KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required. ' +
          'Set it in .env file or export it before starting the server. ' +
          'Example: KAFKA_BROKERS=192.168.86.200:29092'
      );
    }

    this.kafka = new Kafka({
      brokers: brokers.split(','),
      clientId: 'omnidash-event-consumer',
    });

    this.consumer = this.kafka.consumer({
      groupId: 'omnidash-consumers-v2', // Changed to force reading from beginning
    });
  }

  // ============================================================================
  // Deduplication and Event Processing Helpers
  // ============================================================================

  /**
   * Check if an event with this correlation_id has already been processed.
   * Uses LRU cache to prevent duplicate processing while bounding memory.
   */
  private isDuplicate(correlationId: string): boolean {
    if (this.processedEvents.has(correlationId)) {
      return true;
    }
    this.processedEvents.set(correlationId, Date.now());
    return false;
  }

  /**
   * Check if an event should be processed based on event ordering.
   * Returns true only if the event is newer than the node's last processed event.
   */
  private shouldProcess(node: CanonicalOnexNode | undefined, eventEmittedAt: number): boolean {
    if (!node) return true;
    return eventEmittedAt > (node.last_event_at || 0);
  }

  /**
   * Parse a Kafka message into a validated ONEX event envelope with typed payload.
   * Returns null if parsing or validation fails.
   */
  private parseEnvelope<T>(
    message: KafkaMessage,
    payloadSchema: z.ZodSchema<T>
  ): EventEnvelope<T> | null {
    try {
      const raw = JSON.parse(message.value?.toString() || '{}');
      const envelope = EventEnvelopeSchema.parse(raw);
      const payload = payloadSchema.parse(envelope.payload);
      return { ...envelope, payload };
    } catch (e) {
      console.warn('[EventConsumer] Failed to parse event envelope:', e);
      return null;
    }
  }

  /**
   * Validate Kafka broker reachability before starting the consumer.
   *
   * This method performs a lightweight connectivity check by creating a temporary
   * admin connection and listing topics. It's useful for health checks and
   * determining if real-time event streaming should be enabled.
   *
   * @returns Promise resolving to true if broker is reachable, false otherwise
   *
   * @example
   * ```typescript
   * const consumer = getEventConsumer();
   * if (consumer) {
   *   const isReachable = await consumer.validateConnection();
   *   if (isReachable) {
   *     await consumer.start();
   *   } else {
   *     console.log('Kafka not available, using fallback data');
   *   }
   * }
   * ```
   */
  async validateConnection(): Promise<boolean> {
    const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;

    if (!brokers) {
      console.warn('⚠️  KAFKA_BROKERS not configured - real-time event streaming disabled');
      return false;
    }

    try {
      console.log(`🔍 Validating Kafka broker connection: ${brokers}`);

      const admin = this.kafka.admin();
      await admin.connect();

      // Quick health check - list topics to verify connectivity
      const topics = await admin.listTopics();
      console.log(`✅ Kafka broker reachable: ${brokers} (${topics.length} topics available)`);

      await admin.disconnect();
      return true;
    } catch (error) {
      console.error(`❌ Kafka broker unreachable: ${brokers}`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('   Real-time event streaming will be disabled');
      console.error('   Verify KAFKA_BROKERS configuration and network connectivity');
      return false;
    }
  }

  /**
   * Connect to Kafka with exponential backoff retry logic
   * @param maxRetries - Maximum number of retry attempts (default: DEFAULT_MAX_RETRY_ATTEMPTS)
   */
  async connectWithRetry(maxRetries = DEFAULT_MAX_RETRY_ATTEMPTS): Promise<void> {
    if (!this.consumer) {
      throw new Error('Consumer not initialized');
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.consumer.connect();
        console.log('✅ Kafka consumer connected successfully');
        return;
      } catch (error) {
        const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt), RETRY_MAX_DELAY_MS);
        const remaining = maxRetries - attempt - 1;

        if (remaining > 0) {
          console.warn(`⚠️ Kafka connection failed (attempt ${attempt + 1}/${maxRetries})`);
          console.warn(`   Error: ${error instanceof Error ? error.message : String(error)}`);
          console.warn(`   Retrying in ${delay}ms... (${remaining} attempts remaining)`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error('❌ Kafka consumer failed after max retries');
          console.error(
            `   Final error: ${error instanceof Error ? error.message : String(error)}`
          );
          throw new Error(
            `Kafka connection failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  /**
   * Start the Kafka event consumer and begin processing events.
   *
   * This method performs the following operations:
   * 1. Connects to Kafka with retry logic
   * 2. Preloads historical data from PostgreSQL (if enabled)
   * 3. Subscribes to all configured Kafka topics
   * 4. Starts the message processing loop
   * 5. Initializes periodic data pruning
   *
   * @returns Promise that resolves when the consumer is started
   * @throws {Error} If connection fails after max retries
   *
   * @fires EventConsumer#connected - When successfully connected to Kafka
   * @fires EventConsumer#metricUpdate - Initial metrics after preload
   * @fires EventConsumer#actionUpdate - Initial actions after preload
   *
   * @example
   * ```typescript
   * const consumer = getEventConsumer();
   * if (consumer) {
   *   await consumer.start();
   *   console.log('Consumer is now processing events');
   * }
   * ```
   */
  async start() {
    if (this.isRunning || !this.consumer) {
      console.log('Event consumer already running or not initialized');
      return;
    }

    try {
      await this.connectWithRetry();
      console.log('Kafka consumer connected');
      this.emit('connected'); // Emit connected event

      // Preload historical data from PostgreSQL to populate dashboards on startup
      if (process.env.ENABLE_EVENT_PRELOAD !== 'false') {
        try {
          await this.preloadFromDatabase();
          console.log('[EventConsumer] Preloaded historical data from PostgreSQL');
        } catch (e) {
          console.warn('[EventConsumer] Preload skipped due to error:', e);
        }
      }

      await this.consumer.subscribe({
        topics: [
          // Agent topics
          'agent-routing-decisions',
          'agent-transformation-events',
          'router-performance-metrics',
          'agent-actions',
          // Node registry topics (legacy - actual Kafka topic names from omnibase_infra)
          'dev.omninode_bridge.onex.evt.node-introspection.v1',
          'dev.onex.evt.registration-completed.v1',
          'node.heartbeat',
          'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
          // Canonical ONEX topics (OMN-1279)
          onexTopic('node-became-active'),
          onexTopic('node-liveness-expired'),
          onexTopic('node-heartbeat'),
          onexTopic('node-introspection'),
        ],
        fromBeginning: true, // Reprocess historical events to populate metrics
      });

      await this.consumer.run({
        eachMessage: async ({ topic, message }) => {
          try {
            const event = JSON.parse(message.value?.toString() || '{}');
            console.log(`[EventConsumer] Received event from topic: ${topic}`);

            switch (topic) {
              case 'agent-routing-decisions':
                console.log(
                  `[EventConsumer] Processing routing decision for agent: ${event.selected_agent || event.selectedAgent}`
                );
                this.handleRoutingDecision(event);
                break;
              case 'agent-actions':
                console.log(
                  `[EventConsumer] Processing action: ${event.action_type || event.actionType} from ${event.agent_name || event.agentName}`
                );
                this.handleAgentAction(event);
                break;
              case 'agent-transformation-events':
                console.log(
                  `[EventConsumer] Processing transformation: ${event.source_agent || event.sourceAgent} → ${event.target_agent || event.targetAgent}`
                );
                this.handleTransformationEvent(event);
                break;
              case 'router-performance-metrics':
                console.log(
                  `[EventConsumer] Processing performance metric: ${event.routing_duration_ms || event.routingDurationMs}ms`
                );
                this.handlePerformanceMetric(event);
                break;
              case 'dev.omninode_bridge.onex.evt.node-introspection.v1':
              case 'dev.omninode_bridge.onex.evt.registry-request-introspection.v1':
                console.log(
                  `[EventConsumer] Processing node introspection: ${event.node_id || event.nodeId} (${event.reason || 'unknown'})`
                );
                this.handleNodeIntrospection(event);
                break;
              case 'node.heartbeat':
                console.log(
                  `[EventConsumer] Processing node heartbeat: ${event.node_id || event.nodeId}`
                );
                this.handleNodeHeartbeat(event);
                break;
              case 'dev.onex.evt.registration-completed.v1':
                console.log(
                  `[EventConsumer] Processing node state change: ${event.node_id || event.nodeId} -> ${event.new_state || event.newState || 'active'}`
                );
                this.handleNodeStateChange(event);
                break;

              // Canonical ONEX topics (OMN-1279)
              default:
                // Handle canonical ONEX topics using environment-aware routing
                if (topic === onexTopic('node-became-active')) {
                  console.log(`[EventConsumer] Processing canonical node-became-active event`);
                  this.handleCanonicalNodeBecameActive(message);
                } else if (topic === onexTopic('node-liveness-expired')) {
                  console.log(`[EventConsumer] Processing canonical node-liveness-expired event`);
                  this.handleCanonicalNodeLivenessExpired(message);
                } else if (topic === onexTopic('node-heartbeat')) {
                  console.log(`[EventConsumer] Processing canonical node-heartbeat event`);
                  this.handleCanonicalNodeHeartbeat(message);
                } else if (topic === onexTopic('node-introspection')) {
                  console.log(`[EventConsumer] Processing canonical node-introspection event`);
                  this.handleCanonicalNodeIntrospection(message);
                }
                break;
            }
          } catch (error) {
            console.error('Error processing Kafka message:', error);
            this.emit('error', error); // Emit error event

            // If error suggests connection issue, attempt reconnection
            if (
              error instanceof Error &&
              (error.message.includes('connection') ||
                error.message.includes('broker') ||
                error.message.includes('network'))
            ) {
              console.warn('⚠️ Connection error detected, attempting reconnection...');
              try {
                await this.connectWithRetry();
                console.log('✅ Reconnection successful, resuming event processing');
              } catch (reconnectError) {
                console.error('❌ Reconnection failed:', reconnectError);
                this.emit('error', reconnectError);
              }
            }
          }
        },
      });

      this.isRunning = true;

      // Start periodic pruning to prevent unbounded memory growth
      this.pruneTimer = setInterval(() => {
        this.pruneOldData();
      }, this.PRUNE_INTERVAL_MS);

      console.log('✅ Event consumer started with automatic data pruning');
    } catch (error) {
      console.error('Failed to start event consumer:', error);
      this.emit('error', error); // Emit error event
      throw error;
    }
  }

  private async preloadFromDatabase() {
    try {
      // Load recent actions
      const actionsResult = await getIntelligenceDb().execute(
        sql.raw(`
        SELECT id, correlation_id, agent_name, action_type, action_name, action_details, debug_mode, duration_ms, created_at
        FROM agent_actions
        ORDER BY created_at DESC
        LIMIT ${SQL_PRELOAD_ACTIONS_LIMIT};
      `)
      );

      // Handle different return types from Drizzle
      const actionsRows = Array.isArray(actionsResult)
        ? actionsResult
        : actionsResult?.rows || actionsResult || [];

      if (Array.isArray(actionsRows)) {
        // Collect all actions first, then slice once at the end (O(n) instead of O(n²))
        const actions: AgentAction[] = actionsRows.map((r: any) => ({
          id: r.id,
          correlationId: r.correlation_id,
          agentName: r.agent_name,
          actionType: r.action_type,
          actionName: r.action_name,
          actionDetails: r.action_details,
          debugMode: !!r.debug_mode,
          durationMs: Number(r.duration_ms || 0),
          createdAt: new Date(r.created_at),
        }));
        // Single slice operation at the end
        this.recentActions = actions.slice(-this.maxActions);
      }

      // Seed agent metrics using routing decisions + actions
      const metricsResult = await getIntelligenceDb().execute(
        sql.raw(`
        SELECT COALESCE(ard.selected_agent, aa.agent_name) AS agent,
               COUNT(aa.id) AS total_requests,
               AVG(COALESCE(ard.routing_time_ms, aa.duration_ms, 0)) AS avg_routing_time,
               AVG(COALESCE(ard.confidence_score, 0)) AS avg_confidence
        FROM agent_actions aa
        FULL OUTER JOIN agent_routing_decisions ard
          ON aa.correlation_id = ard.correlation_id
        WHERE (aa.created_at IS NULL OR aa.created_at >= NOW() - INTERVAL '24 hours')
           OR (ard.created_at IS NULL OR ard.created_at >= NOW() - INTERVAL '24 hours')
        GROUP BY COALESCE(ard.selected_agent, aa.agent_name)
        ORDER BY total_requests DESC
        LIMIT ${SQL_PRELOAD_METRICS_LIMIT};
      `)
      );

      // Handle different return types from Drizzle
      const metricsRows = Array.isArray(metricsResult)
        ? metricsResult
        : metricsResult?.rows || metricsResult || [];

      if (Array.isArray(metricsRows)) {
        metricsRows.forEach((r: any) => {
          const agent = r.agent || 'unknown';
          this.agentMetrics.set(agent, {
            count: Number(r.total_requests || 0),
            totalRoutingTime: Number(r.avg_routing_time || 0) * Number(r.total_requests || 0),
            totalConfidence: Number(r.avg_confidence || 0) * Number(r.total_requests || 0),
            successCount: 0,
            errorCount: 0,
            lastSeen: new Date(),
          });
        });
      }

      // Emit initial metric snapshot
      this.emit('metricUpdate', this.getAgentMetrics());
      // Emit initial actions snapshot (emit last one to trigger UI refresh)
      const last = this.recentActions[this.recentActions.length - 1];
      if (last) this.emit('actionUpdate', last);
    } catch (error) {
      console.error('[EventConsumer] Error during preloadFromDatabase:', error);
      // Don't throw - allow server to continue even if preload fails
    }
  }

  private handleRoutingDecision(event: RawRoutingDecisionEvent): void {
    const agent = event.selected_agent || event.selectedAgent;
    if (!agent) {
      console.warn('[EventConsumer] Routing decision missing agent name, skipping');
      return;
    }

    const existing = this.agentMetrics.get(agent) || {
      count: 0,
      totalRoutingTime: 0,
      totalConfidence: 0,
      successCount: 0,
      errorCount: 0,
      lastSeen: new Date(),
    };

    existing.count++;
    existing.totalRoutingTime += event.routing_time_ms || event.routingTimeMs || 0;
    existing.totalConfidence += event.confidence_score || event.confidenceScore || 0;
    existing.lastSeen = new Date();

    this.agentMetrics.set(agent, existing);
    console.log(
      `[EventConsumer] Updated metrics for ${agent}: ${existing.count} requests, avg confidence ${(existing.totalConfidence / existing.count).toFixed(2)}`
    );

    // Cleanup old entries (older than 24h)
    this.cleanupOldMetrics();

    // Emit update event for WebSocket broadcast
    this.emit('metricUpdate', this.getAgentMetrics());

    // Store routing decision
    const decision: RoutingDecision = {
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id || event.correlationId || '',
      userRequest: event.user_request || event.userRequest || '',
      selectedAgent: agent,
      confidenceScore: event.confidence_score || event.confidenceScore || 0,
      routingStrategy: event.routing_strategy || event.routingStrategy || '',
      alternatives: event.alternatives,
      reasoning: event.reasoning,
      routingTimeMs: event.routing_time_ms || event.routingTimeMs || 0,
      createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
    };

    this.routingDecisions.unshift(decision);

    // Keep only last N decisions
    if (this.routingDecisions.length > this.maxDecisions) {
      this.routingDecisions = this.routingDecisions.slice(0, this.maxDecisions);
    }

    // Emit routing update
    this.emit('routingUpdate', decision);
  }

  private handleAgentAction(event: RawAgentActionEvent): void {
    const action: AgentAction = {
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id || event.correlationId || '',
      agentName: event.agent_name || event.agentName || '',
      actionType: event.action_type || event.actionType || '',
      actionName: event.action_name || event.actionName || '',
      actionDetails: event.action_details || event.actionDetails,
      debugMode: event.debug_mode || event.debugMode,
      durationMs: event.duration_ms || event.durationMs || 0,
      createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
    };

    this.recentActions.unshift(action);
    console.log(
      `[EventConsumer] Added action to queue: ${action.actionName} (${action.agentName}), queue size: ${this.recentActions.length}`
    );

    // Track success/error rates per agent
    if (action.agentName && (action.actionType === 'success' || action.actionType === 'error')) {
      const existing = this.agentMetrics.get(action.agentName) || {
        count: 0,
        totalRoutingTime: 0,
        totalConfidence: 0,
        successCount: 0,
        errorCount: 0,
        lastSeen: new Date(),
      };

      if (action.actionType === 'success') {
        existing.successCount++;
      } else if (action.actionType === 'error') {
        existing.errorCount++;
      }

      existing.lastSeen = new Date();
      this.agentMetrics.set(action.agentName, existing);

      console.log(
        `[EventConsumer] Updated ${action.agentName} success/error: ${existing.successCount}/${existing.errorCount}`
      );

      // Emit metric update since success rate changed
      this.emit('metricUpdate', this.getAgentMetrics());
    }

    // Keep only last N actions
    if (this.recentActions.length > this.maxActions) {
      this.recentActions = this.recentActions.slice(0, this.maxActions);
    }

    // Emit update event for WebSocket broadcast
    this.emit('actionUpdate', action);
  }

  private handleTransformationEvent(event: RawTransformationEvent): void {
    const transformation: TransformationEvent = {
      id: event.id || crypto.randomUUID(),
      correlationId: event.correlation_id || event.correlationId || '',
      sourceAgent: event.source_agent || event.sourceAgent || '',
      targetAgent: event.target_agent || event.targetAgent || '',
      transformationDurationMs:
        event.transformation_duration_ms || event.transformationDurationMs || 0,
      success: event.success ?? true,
      confidenceScore: event.confidence_score || event.confidenceScore || 0,
      createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
    };

    this.recentTransformations.unshift(transformation);
    console.log(
      `[EventConsumer] Added transformation to queue: ${transformation.sourceAgent} → ${transformation.targetAgent}, queue size: ${this.recentTransformations.length}`
    );

    // Keep only last N transformations
    if (this.recentTransformations.length > this.maxTransformations) {
      this.recentTransformations = this.recentTransformations.slice(0, this.maxTransformations);
    }

    // Emit update event for WebSocket broadcast
    this.emit('transformationUpdate', transformation);
  }

  private handlePerformanceMetric(event: RawPerformanceMetricEvent): void {
    try {
      const metric = {
        id: event.id || crypto.randomUUID(),
        correlationId: event.correlation_id || event.correlationId || '',
        queryText: event.query_text || event.queryText || '',
        routingDurationMs: event.routing_duration_ms || event.routingDurationMs || 0,
        cacheHit: event.cache_hit ?? event.cacheHit ?? false,
        candidatesEvaluated: event.candidates_evaluated || event.candidatesEvaluated || 0,
        triggerMatchStrategy:
          event.trigger_match_strategy || event.triggerMatchStrategy || 'unknown',
        createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
      };

      // Store in memory (limit to PERFORMANCE_METRICS_BUFFER_SIZE recent)
      this.performanceMetrics.unshift(metric);
      if (this.performanceMetrics.length > PERFORMANCE_METRICS_BUFFER_SIZE) {
        this.performanceMetrics = this.performanceMetrics.slice(0, PERFORMANCE_METRICS_BUFFER_SIZE);
      }

      // Update aggregated stats
      this.performanceStats.totalQueries++;
      if (metric.cacheHit) {
        this.performanceStats.cacheHitCount++;
      }
      this.performanceStats.totalRoutingDuration += metric.routingDurationMs;
      this.performanceStats.avgRoutingDuration =
        this.performanceStats.totalRoutingDuration / this.performanceStats.totalQueries;

      // Emit for WebSocket broadcast
      this.emit('performanceUpdate', {
        metric,
        stats: { ...this.performanceStats },
      });

      console.log(
        `[EventConsumer] Processed performance metric: ${metric.routingDurationMs}ms, cache hit: ${metric.cacheHit}, strategy: ${metric.triggerMatchStrategy}`
      );
    } catch (error) {
      console.error('[EventConsumer] Error processing performance metric:', error);
    }
  }

  private handleNodeIntrospection(event: RawNodeIntrospectionEvent): void {
    try {
      const nodeId = event.node_id || event.nodeId;
      if (!nodeId) {
        console.warn('[EventConsumer] Node introspection missing node_id, skipping');
        return;
      }

      const introspectionEvent: NodeIntrospectionEvent = {
        id: event.id || crypto.randomUUID(),
        nodeId,
        nodeType: parseNodeType(event.node_type || event.nodeType, 'COMPUTE'),
        nodeVersion: event.node_version || event.nodeVersion || '1.0.0',
        endpoints: event.endpoints || {},
        currentState: parseRegistrationState(
          event.current_state || event.currentState,
          'pending_registration'
        ),
        reason: parseIntrospectionReason(event.reason, 'STARTUP'),
        correlationId: event.correlation_id || event.correlationId || '',
        createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
      };

      // Store introspection event
      this.nodeIntrospectionEvents.unshift(introspectionEvent);
      if (this.nodeIntrospectionEvents.length > this.maxNodeEvents) {
        this.nodeIntrospectionEvents = this.nodeIntrospectionEvents.slice(0, this.maxNodeEvents);
      }

      // Update or create registered node
      const existingNode = this.registeredNodes.get(nodeId);
      const node: RegisteredNode = {
        nodeId,
        nodeType: introspectionEvent.nodeType,
        state: introspectionEvent.currentState,
        version: introspectionEvent.nodeVersion,
        uptimeSeconds: existingNode?.uptimeSeconds || 0,
        lastSeen: introspectionEvent.createdAt,
        memoryUsageMb: existingNode?.memoryUsageMb,
        cpuUsagePercent: existingNode?.cpuUsagePercent,
        endpoints: introspectionEvent.endpoints,
      };

      // Evict oldest node if at capacity and this is a new node
      if (
        this.registeredNodes.size >= this.MAX_REGISTERED_NODES &&
        !this.registeredNodes.has(nodeId)
      ) {
        let oldestNodeId: string | null = null;
        let oldestTime = Infinity;
        const nodeEntries = Array.from(this.registeredNodes.entries());
        for (const [id, n] of nodeEntries) {
          const lastSeenTime = new Date(n.lastSeen).getTime();
          if (lastSeenTime < oldestTime) {
            oldestTime = lastSeenTime;
            oldestNodeId = id;
          }
        }
        if (oldestNodeId) {
          this.registeredNodes.delete(oldestNodeId);
          console.log(
            `[EventConsumer] Evicted oldest node ${oldestNodeId} to make room for ${nodeId}`
          );
        }
      }

      this.registeredNodes.set(nodeId, node);

      // Emit events
      this.emit('nodeIntrospectionUpdate', introspectionEvent);
      this.emit('nodeRegistryUpdate', this.getRegisteredNodes());

      console.log(
        `[EventConsumer] Processed node introspection: ${nodeId} (${introspectionEvent.nodeType}, ${introspectionEvent.reason})`
      );
    } catch (error) {
      console.error('[EventConsumer] Error processing node introspection:', error);
    }
  }

  private handleNodeHeartbeat(event: RawNodeHeartbeatEvent): void {
    try {
      const nodeId = event.node_id || event.nodeId;
      if (!nodeId) {
        console.warn('[EventConsumer] Node heartbeat missing node_id, skipping');
        return;
      }

      const heartbeatEvent: NodeHeartbeatEvent = {
        id: event.id || crypto.randomUUID(),
        nodeId,
        uptimeSeconds: event.uptime_seconds || event.uptimeSeconds || 0,
        activeOperationsCount: event.active_operations_count || event.activeOperationsCount || 0,
        memoryUsageMb: event.memory_usage_mb || event.memoryUsageMb || 0,
        cpuUsagePercent: event.cpu_usage_percent || event.cpuUsagePercent || 0,
        createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
      };

      // Store heartbeat event
      this.nodeHeartbeatEvents.unshift(heartbeatEvent);
      if (this.nodeHeartbeatEvents.length > this.maxNodeEvents) {
        this.nodeHeartbeatEvents = this.nodeHeartbeatEvents.slice(0, this.maxNodeEvents);
      }

      // Update registered node if exists
      const existingNode = this.registeredNodes.get(nodeId);
      if (existingNode) {
        this.registeredNodes.set(nodeId, {
          ...existingNode,
          uptimeSeconds: heartbeatEvent.uptimeSeconds,
          lastSeen: heartbeatEvent.createdAt,
          memoryUsageMb: heartbeatEvent.memoryUsageMb,
          cpuUsagePercent: heartbeatEvent.cpuUsagePercent,
        });
      }

      // Emit events
      this.emit('nodeHeartbeatUpdate', heartbeatEvent);
      this.emit('nodeRegistryUpdate', this.getRegisteredNodes());

      console.log(
        `[EventConsumer] Processed node heartbeat: ${nodeId} (CPU: ${heartbeatEvent.cpuUsagePercent}%, Mem: ${heartbeatEvent.memoryUsageMb}MB)`
      );
    } catch (error) {
      console.error('[EventConsumer] Error processing node heartbeat:', error);
    }
  }

  private handleNodeStateChange(event: RawNodeStateChangeEvent): void {
    try {
      const nodeId = event.node_id || event.nodeId;
      if (!nodeId) {
        console.warn('[EventConsumer] Node state change missing node_id, skipping');
        return;
      }

      const stateChangeEvent: NodeStateChangeEvent = {
        id: event.id || crypto.randomUUID(),
        nodeId,
        previousState: parseRegistrationState(
          event.previous_state || event.previousState,
          'pending_registration'
        ),
        newState: parseRegistrationState(event.new_state || event.newState, 'active'),
        reason: event.reason,
        createdAt: new Date(event.timestamp || event.createdAt || Date.now()),
      };

      // Store state change event
      this.nodeStateChangeEvents.unshift(stateChangeEvent);
      if (this.nodeStateChangeEvents.length > this.maxNodeEvents) {
        this.nodeStateChangeEvents = this.nodeStateChangeEvents.slice(0, this.maxNodeEvents);
      }

      // Update registered node if exists
      const existingNode = this.registeredNodes.get(nodeId);
      if (existingNode) {
        this.registeredNodes.set(nodeId, {
          ...existingNode,
          state: stateChangeEvent.newState,
          lastSeen: stateChangeEvent.createdAt,
        });
      }

      // Emit events
      this.emit('nodeStateChangeUpdate', stateChangeEvent);
      this.emit('nodeRegistryUpdate', this.getRegisteredNodes());

      console.log(
        `[EventConsumer] Processed node state change: ${nodeId} (${stateChangeEvent.previousState} -> ${stateChangeEvent.newState})`
      );
    } catch (error) {
      console.error('[EventConsumer] Error processing node state change:', error);
    }
  }

  // ============================================================================
  // Canonical ONEX Event Handlers (OMN-1279)
  // These handlers use the new event envelope format with proper deduplication
  // ============================================================================

  /**
   * Handle canonical node-became-active events.
   * Updates the canonical node registry and emits dashboard events.
   */
  private handleCanonicalNodeBecameActive(message: KafkaMessage): void {
    const envelope = this.parseEnvelope(message, NodeBecameActivePayloadSchema);
    if (!envelope) return;
    if (this.isDuplicate(envelope.correlation_id)) {
      console.log(
        `[EventConsumer] Duplicate node-became-active event, skipping: ${envelope.correlation_id}`
      );
      return;
    }

    const { payload, emitted_at } = envelope;
    const emittedAtMs = new Date(emitted_at).getTime();

    const existing = this.canonicalNodes.get(payload.node_id);
    if (existing && !this.shouldProcess(existing, emittedAtMs)) {
      console.log(`[EventConsumer] Stale node-became-active event, skipping: ${payload.node_id}`);
      return;
    }

    // Update canonical node state
    this.canonicalNodes.set(payload.node_id, {
      node_id: payload.node_id,
      state: 'ACTIVE',
      capabilities: payload.capabilities,
      activated_at: emittedAtMs,
      last_heartbeat_at: emittedAtMs,
      last_event_at: emittedAtMs,
    });

    // Emit dashboard event for WebSocket broadcast
    this.emit('nodeRegistryUpdate', {
      type: 'NODE_ACTIVATED',
      payload: { node_id: payload.node_id, capabilities: payload.capabilities },
      emitted_at: emittedAtMs,
    });

    console.log(`[EventConsumer] Canonical node-became-active processed: ${payload.node_id}`);
  }

  /**
   * Handle canonical node-liveness-expired events.
   * Marks the node as OFFLINE in the canonical registry.
   */
  private handleCanonicalNodeLivenessExpired(message: KafkaMessage): void {
    const envelope = this.parseEnvelope(message, NodeLivenessExpiredPayloadSchema);
    if (!envelope) return;
    if (this.isDuplicate(envelope.correlation_id)) {
      console.log(
        `[EventConsumer] Duplicate node-liveness-expired event, skipping: ${envelope.correlation_id}`
      );
      return;
    }

    const { payload, emitted_at } = envelope;
    const emittedAtMs = new Date(emitted_at).getTime();

    const node = this.canonicalNodes.get(payload.node_id);
    if (!node) {
      console.log(`[EventConsumer] Node not found for liveness-expired: ${payload.node_id}`);
      return;
    }
    if (!this.shouldProcess(node, emittedAtMs)) {
      console.log(
        `[EventConsumer] Stale node-liveness-expired event, skipping: ${payload.node_id}`
      );
      return;
    }

    // Update node state to OFFLINE
    node.state = 'OFFLINE';
    node.offline_at = emittedAtMs;
    node.last_event_at = emittedAtMs;

    // Emit dashboard event for WebSocket broadcast
    this.emit('nodeRegistryUpdate', {
      type: 'NODE_OFFLINE',
      payload: { node_id: payload.node_id },
      emitted_at: emittedAtMs,
    });

    console.log(`[EventConsumer] Canonical node-liveness-expired processed: ${payload.node_id}`);
  }

  /**
   * Handle canonical node-heartbeat events.
   * Updates the last_heartbeat_at timestamp for the node.
   */
  private handleCanonicalNodeHeartbeat(message: KafkaMessage): void {
    const envelope = this.parseEnvelope(message, NodeHeartbeatPayloadSchema);
    if (!envelope) return;
    if (this.isDuplicate(envelope.correlation_id)) {
      return; // Silent skip for heartbeats (high frequency)
    }

    const { payload, emitted_at } = envelope;
    const emittedAtMs = new Date(emitted_at).getTime();

    const node = this.canonicalNodes.get(payload.node_id);
    if (!node) {
      // Node not registered yet, create a pending entry
      this.canonicalNodes.set(payload.node_id, {
        node_id: payload.node_id,
        state: 'PENDING',
        last_heartbeat_at: emittedAtMs,
        last_event_at: emittedAtMs,
      });
      return;
    }

    if (!this.shouldProcess(node, emittedAtMs)) {
      return; // Stale heartbeat, skip
    }

    // Update heartbeat timestamp
    node.last_heartbeat_at = emittedAtMs;
    node.last_event_at = emittedAtMs;

    // Emit dashboard event for WebSocket broadcast
    this.emit('nodeRegistryUpdate', {
      type: 'NODE_HEARTBEAT',
      payload: { node_id: payload.node_id, last_heartbeat_at: emittedAtMs },
      emitted_at: emittedAtMs,
    });
  }

  /**
   * Handle canonical node-introspection events.
   * Updates node metadata in the canonical registry.
   */
  private handleCanonicalNodeIntrospection(message: KafkaMessage): void {
    const envelope = this.parseEnvelope(message, NodeIntrospectionPayloadSchema);
    if (!envelope) return;
    if (this.isDuplicate(envelope.correlation_id)) {
      console.log(
        `[EventConsumer] Duplicate node-introspection event, skipping: ${envelope.correlation_id}`
      );
      return;
    }

    const { payload, emitted_at } = envelope;
    const emittedAtMs = new Date(emitted_at).getTime();

    const existing = this.canonicalNodes.get(payload.node_id);
    if (existing && !this.shouldProcess(existing, emittedAtMs)) {
      console.log(`[EventConsumer] Stale node-introspection event, skipping: ${payload.node_id}`);
      return;
    }

    // Update or create canonical node
    const node: CanonicalOnexNode = existing
      ? {
          ...existing,
          capabilities: payload.capabilities || existing.capabilities,
          last_event_at: emittedAtMs,
        }
      : {
          node_id: payload.node_id,
          state: 'PENDING',
          capabilities: payload.capabilities,
          last_event_at: emittedAtMs,
        };

    this.canonicalNodes.set(payload.node_id, node);

    // Emit dashboard event for WebSocket broadcast
    this.emit('nodeRegistryUpdate', {
      type: 'NODE_INTROSPECTION',
      payload: { node_id: payload.node_id, capabilities: payload.capabilities },
      emitted_at: emittedAtMs,
    });

    console.log(`[EventConsumer] Canonical node-introspection processed: ${payload.node_id}`);
  }

  private cleanupOldMetrics() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const entries = Array.from(this.agentMetrics.entries());
    for (const [agent, metrics] of entries) {
      if (metrics.lastSeen < cutoff) {
        this.agentMetrics.delete(agent);
      }
    }
  }

  /**
   * Prune old data from in-memory arrays to prevent unbounded memory growth
   * Removes events older than DATA_RETENTION_MS (24 hours by default)
   */
  private pruneOldData(): void {
    const cutoff = Date.now() - this.DATA_RETENTION_MS;

    // Prune recent actions
    const actionsBefore = this.recentActions.length;
    this.recentActions = this.recentActions.filter((action) => {
      const timestamp = new Date(action.createdAt).getTime();
      return timestamp > cutoff;
    });
    const actionsRemoved = actionsBefore - this.recentActions.length;

    // Prune routing decisions
    const decisionsBefore = this.routingDecisions.length;
    this.routingDecisions = this.routingDecisions.filter((decision) => {
      const timestamp = new Date(decision.createdAt).getTime();
      return timestamp > cutoff;
    });
    const decisionsRemoved = decisionsBefore - this.routingDecisions.length;

    // Prune transformations
    const transformationsBefore = this.recentTransformations.length;
    this.recentTransformations = this.recentTransformations.filter((transformation) => {
      const timestamp = new Date(transformation.createdAt).getTime();
      return timestamp > cutoff;
    });
    const transformationsRemoved = transformationsBefore - this.recentTransformations.length;

    // Prune performance metrics
    const metricsBefore = this.performanceMetrics.length;
    this.performanceMetrics = this.performanceMetrics.filter((metric) => {
      const timestamp = new Date(metric.createdAt).getTime();
      return timestamp > cutoff;
    });
    const metricsRemoved = metricsBefore - this.performanceMetrics.length;

    // Prune node introspection events
    const introspectionBefore = this.nodeIntrospectionEvents.length;
    this.nodeIntrospectionEvents = this.nodeIntrospectionEvents.filter((event) => {
      const timestamp = new Date(event.createdAt).getTime();
      return timestamp > cutoff;
    });
    const introspectionRemoved = introspectionBefore - this.nodeIntrospectionEvents.length;

    // Prune node heartbeat events
    const heartbeatBefore = this.nodeHeartbeatEvents.length;
    this.nodeHeartbeatEvents = this.nodeHeartbeatEvents.filter((event) => {
      const timestamp = new Date(event.createdAt).getTime();
      return timestamp > cutoff;
    });
    const heartbeatRemoved = heartbeatBefore - this.nodeHeartbeatEvents.length;

    // Prune node state change events
    const stateChangeBefore = this.nodeStateChangeEvents.length;
    this.nodeStateChangeEvents = this.nodeStateChangeEvents.filter((event) => {
      const timestamp = new Date(event.createdAt).getTime();
      return timestamp > cutoff;
    });
    const stateChangeRemoved = stateChangeBefore - this.nodeStateChangeEvents.length;

    // Prune stale registered nodes (not seen in 24 hours)
    const nodesBefore = this.registeredNodes.size;
    const nodeEntries = Array.from(this.registeredNodes.entries());
    for (const [nodeId, node] of nodeEntries) {
      const lastSeenTime = new Date(node.lastSeen).getTime();
      if (lastSeenTime < cutoff) {
        this.registeredNodes.delete(nodeId);
      }
    }
    const nodesRemoved = nodesBefore - this.registeredNodes.size;

    // Log pruning statistics if anything was removed
    const totalRemoved =
      actionsRemoved +
      decisionsRemoved +
      transformationsRemoved +
      metricsRemoved +
      introspectionRemoved +
      heartbeatRemoved +
      stateChangeRemoved +
      nodesRemoved;
    if (totalRemoved > 0) {
      console.log(
        `🧹 Pruned old data: ${actionsRemoved} actions, ${decisionsRemoved} decisions, ${transformationsRemoved} transformations, ${metricsRemoved} metrics, ${introspectionRemoved + heartbeatRemoved + stateChangeRemoved} node events, ${nodesRemoved} stale nodes (total: ${totalRemoved})`
      );
    }
  }

  // Public getters for API endpoints

  /**
   * Get aggregated metrics for all active agents.
   *
   * Returns metrics for agents that have been active within the last 24 hours,
   * including request counts, success rates, routing times, and confidence scores.
   *
   * @returns Array of agent metrics, sorted by agent name
   *
   * @example
   * ```typescript
   * const consumer = getEventConsumer();
   * const metrics = consumer?.getAgentMetrics() ?? [];
   *
   * metrics.forEach(metric => {
   *   console.log(`${metric.agent}: ${metric.totalRequests} requests, ${metric.successRate}% success`);
   * });
   * ```
   */
  getAgentMetrics(): AgentMetrics[] {
    const now = new Date();
    // Extended window to show historical data (was 5 minutes, now 24 hours)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return (
      Array.from(this.agentMetrics.entries())
        // Filter to only agents active in last 24 hours
        .filter(([_, data]) => data.lastSeen >= twentyFourHoursAgo)
        .map(([agent, data]) => {
          // Calculate success rate if we have success/error events
          const totalOutcomes = data.successCount + data.errorCount;
          let successRate: number | null = null;

          if (totalOutcomes > 0) {
            // Use actual success/error tracking if available
            successRate = data.successCount / totalOutcomes;
          } else {
            // Fallback: Use confidence score as proxy for success rate
            // High confidence (>0.85) = likely successful routing
            const avgConfidence = data.totalConfidence / data.count;
            successRate = avgConfidence; // Direct mapping: 0.85 confidence = 85% success rate
          }

          return {
            agent,
            totalRequests: data.count,
            successRate,
            avgRoutingTime: data.totalRoutingTime / data.count,
            avgConfidence: data.totalConfidence / data.count,
            lastSeen: data.lastSeen,
          };
        })
    );
  }

  /**
   * Get recent agent actions from the in-memory buffer.
   *
   * Actions are stored in reverse chronological order (newest first).
   * The buffer maintains up to 100 actions by default.
   *
   * @param limit - Optional maximum number of actions to return. If not specified, returns all buffered actions.
   * @returns Array of agent actions, newest first
   *
   * @example
   * ```typescript
   * // Get last 10 actions
   * const recentActions = consumer.getRecentActions(10);
   *
   * // Get all buffered actions
   * const allActions = consumer.getRecentActions();
   * ```
   */
  getRecentActions(limit?: number): AgentAction[] {
    if (limit && limit > 0) {
      return this.recentActions.slice(0, limit);
    }
    return this.recentActions;
  }

  /**
   * Get actions for a specific agent within a time window.
   *
   * Filters the in-memory action buffer by agent name and time range.
   * Useful for generating agent-specific activity reports.
   *
   * @param agentName - The name of the agent to filter by
   * @param timeWindow - Time window string: '1h' (default), '24h', or '7d'
   * @returns Array of actions matching the agent and time criteria
   *
   * @example
   * ```typescript
   * // Get actions for 'polymorphic-agent' in the last hour
   * const hourlyActions = consumer.getActionsByAgent('polymorphic-agent', '1h');
   *
   * // Get actions for 'code-quality-analyzer' in the last 24 hours
   * const dailyActions = consumer.getActionsByAgent('code-quality-analyzer', '24h');
   * ```
   */
  getActionsByAgent(agentName: string, timeWindow: string = '1h'): AgentAction[] {
    // Parse time window
    let windowMs: number;
    switch (timeWindow) {
      case '1h':
        windowMs = 60 * 60 * 1000;
        break;
      case '24h':
        windowMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        windowMs = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        windowMs = 60 * 60 * 1000; // Default to 1h
    }

    const since = new Date(Date.now() - windowMs);

    return this.recentActions.filter(
      (action) => action.agentName === agentName && action.createdAt >= since
    );
  }

  /**
   * Get routing decisions with optional filtering.
   *
   * Routing decisions track which agent was selected to handle each user request,
   * including confidence scores, alternatives considered, and routing time.
   *
   * @param filters - Optional filters to apply
   * @param filters.agent - Filter by selected agent name
   * @param filters.minConfidence - Filter by minimum confidence score (0-1)
   * @returns Array of routing decisions matching the filters, newest first
   *
   * @example
   * ```typescript
   * // Get all routing decisions
   * const allDecisions = consumer.getRoutingDecisions();
   *
   * // Get decisions for a specific agent
   * const agentDecisions = consumer.getRoutingDecisions({ agent: 'api-architect' });
   *
   * // Get high-confidence decisions
   * const confidentDecisions = consumer.getRoutingDecisions({ minConfidence: 0.9 });
   *
   * // Combine filters
   * const filtered = consumer.getRoutingDecisions({
   *   agent: 'code-quality-analyzer',
   *   minConfidence: 0.85
   * });
   * ```
   */
  getRoutingDecisions(filters?: { agent?: string; minConfidence?: number }): RoutingDecision[] {
    let decisions = this.routingDecisions;

    if (filters?.agent) {
      decisions = decisions.filter((d) => d.selectedAgent === filters.agent);
    }

    if (filters?.minConfidence !== undefined) {
      decisions = decisions.filter((d) => d.confidenceScore >= filters.minConfidence!);
    }

    return decisions;
  }

  /**
   * Get recent agent transformation events.
   *
   * Transformation events track when the polymorphic agent transforms into
   * specialized agents during task execution. Includes timing and success status.
   *
   * @param limit - Maximum number of transformations to return (default: 50)
   * @returns Array of transformation events, newest first
   *
   * @example
   * ```typescript
   * // Get last 10 transformations
   * const transformations = consumer.getRecentTransformations(10);
   *
   * transformations.forEach(t => {
   *   console.log(`${t.sourceAgent} -> ${t.targetAgent}: ${t.success ? 'OK' : 'Failed'}`);
   * });
   * ```
   */
  getRecentTransformations(limit: number = 50): TransformationEvent[] {
    return this.recentTransformations.slice(0, limit);
  }

  /**
   * Get recent router performance metrics.
   *
   * Performance metrics track routing latency, cache hit rates,
   * candidates evaluated, and trigger match strategies used.
   *
   * @param limit - Maximum number of metrics to return (default: 100)
   * @returns Array of performance metric objects, newest first
   *
   * @example
   * ```typescript
   * const metrics = consumer.getPerformanceMetrics(50);
   *
   * const avgLatency = metrics.reduce((sum, m) => sum + m.routingDurationMs, 0) / metrics.length;
   * console.log(`Average routing latency: ${avgLatency.toFixed(2)}ms`);
   * ```
   */
  getPerformanceMetrics(limit: number = 100): Array<any> {
    return this.performanceMetrics.slice(0, limit);
  }

  /**
   * Get aggregated performance statistics.
   *
   * Returns summary statistics computed from all processed performance metrics,
   * including total queries, cache hit rate, and average routing duration.
   *
   * @returns Performance statistics object
   * @property {number} totalQueries - Total number of routing queries processed
   * @property {number} cacheHitCount - Number of queries served from cache
   * @property {number} avgRoutingDuration - Average routing time in milliseconds
   * @property {number} totalRoutingDuration - Sum of all routing times
   * @property {number} cacheHitRate - Cache hit rate as percentage (0-100)
   *
   * @example
   * ```typescript
   * const stats = consumer.getPerformanceStats();
   *
   * console.log(`Total queries: ${stats.totalQueries}`);
   * console.log(`Cache hit rate: ${stats.cacheHitRate.toFixed(1)}%`);
   * console.log(`Avg routing time: ${stats.avgRoutingDuration.toFixed(2)}ms`);
   * ```
   */
  getPerformanceStats() {
    return {
      ...this.performanceStats,
      cacheHitRate:
        this.performanceStats.totalQueries > 0
          ? (this.performanceStats.cacheHitCount / this.performanceStats.totalQueries) * 100
          : 0,
    };
  }

  /**
   * Get the health status of the event consumer.
   *
   * Returns current operational status including whether the consumer is running,
   * counts of processed events, and current timestamp.
   *
   * @returns Health status object
   * @property {string} status - 'healthy' if running, 'unhealthy' otherwise
   * @property {number} eventsProcessed - Number of unique agents tracked
   * @property {number} recentActionsCount - Number of actions in buffer
   * @property {number} registeredNodesCount - Number of registered ONEX nodes
   * @property {string} timestamp - ISO 8601 timestamp of the check
   *
   * @example
   * ```typescript
   * const health = consumer.getHealthStatus();
   *
   * if (health.status === 'healthy') {
   *   console.log(`Processing events for ${health.eventsProcessed} agents`);
   * } else {
   *   console.warn('Event consumer is not running');
   * }
   * ```
   */
  getHealthStatus() {
    return {
      status: this.isRunning ? 'healthy' : 'unhealthy',
      eventsProcessed: this.agentMetrics.size,
      recentActionsCount: this.recentActions.length,
      registeredNodesCount: this.registeredNodes.size,
      timestamp: new Date().toISOString(),
    };
  }

  // Node Registry getters
  getRegisteredNodes(): RegisteredNode[] {
    return Array.from(this.registeredNodes.values());
  }

  getRegisteredNode(nodeId: string): RegisteredNode | undefined {
    return this.registeredNodes.get(nodeId);
  }

  getNodeIntrospectionEvents(limit?: number): NodeIntrospectionEvent[] {
    if (limit && limit > 0) {
      return this.nodeIntrospectionEvents.slice(0, limit);
    }
    return this.nodeIntrospectionEvents;
  }

  getNodeHeartbeatEvents(limit?: number): NodeHeartbeatEvent[] {
    if (limit && limit > 0) {
      return this.nodeHeartbeatEvents.slice(0, limit);
    }
    return this.nodeHeartbeatEvents;
  }

  getNodeStateChangeEvents(limit?: number): NodeStateChangeEvent[] {
    if (limit && limit > 0) {
      return this.nodeStateChangeEvents.slice(0, limit);
    }
    return this.nodeStateChangeEvents;
  }

  getNodeRegistryStats() {
    const nodes = this.getRegisteredNodes();
    const activeNodes = nodes.filter((n) => n.state === 'active').length;
    const pendingNodes = nodes.filter((n) =>
      ['pending_registration', 'awaiting_ack', 'ack_received', 'accepted'].includes(n.state)
    ).length;
    const failedNodes = nodes.filter((n) =>
      ['rejected', 'liveness_expired', 'ack_timed_out'].includes(n.state)
    ).length;

    // Count by node type
    const typeDistribution = nodes.reduce(
      (acc, node) => {
        acc[node.nodeType] = (acc[node.nodeType] || 0) + 1;
        return acc;
      },
      {} as Record<NodeType, number>
    );

    return {
      totalNodes: nodes.length,
      activeNodes,
      pendingNodes,
      failedNodes,
      typeDistribution,
    };
  }

  // ============================================================================
  // Canonical ONEX Node Registry Getters (OMN-1279)
  // ============================================================================

  /**
   * Get all canonical ONEX nodes from the event-driven registry.
   * These nodes use the new ONEX event envelope format.
   */
  getCanonicalNodes(): CanonicalOnexNode[] {
    return Array.from(this.canonicalNodes.values());
  }

  /**
   * Get a specific canonical node by ID.
   */
  getCanonicalNode(nodeId: string): CanonicalOnexNode | undefined {
    return this.canonicalNodes.get(nodeId);
  }

  /**
   * Get statistics for the canonical node registry.
   */
  getCanonicalNodeStats(): {
    totalNodes: number;
    activeNodes: number;
    pendingNodes: number;
    offlineNodes: number;
  } {
    const nodes = this.getCanonicalNodes();
    return {
      totalNodes: nodes.length,
      activeNodes: nodes.filter((n) => n.state === 'ACTIVE').length,
      pendingNodes: nodes.filter((n) => n.state === 'PENDING').length,
      offlineNodes: nodes.filter((n) => n.state === 'OFFLINE').length,
    };
  }

  /**
   * Stop the Kafka event consumer and clean up resources.
   *
   * This method gracefully shuts down the consumer by:
   * 1. Clearing the periodic pruning timer
   * 2. Disconnecting from Kafka
   * 3. Emitting a 'disconnected' event
   *
   * @returns Promise that resolves when the consumer is stopped
   *
   * @fires EventConsumer#disconnected - When successfully disconnected
   * @fires EventConsumer#error - If an error occurs during disconnection
   *
   * @example
   * ```typescript
   * const consumer = getEventConsumer();
   * if (consumer) {
   *   await consumer.stop();
   *   console.log('Consumer stopped successfully');
   * }
   * ```
   */
  async stop() {
    if (!this.consumer || !this.isRunning) {
      return;
    }

    try {
      // Clear pruning timer
      if (this.pruneTimer) {
        clearInterval(this.pruneTimer);
        this.pruneTimer = undefined;
      }

      await this.consumer.disconnect();
      this.isRunning = false;
      console.log('✅ Event consumer stopped');
      this.emit('disconnected'); // Emit disconnected event
    } catch (error) {
      console.error('Error disconnecting Kafka consumer:', error);
      this.emit('error', error); // Emit error event
    }
  }
}

// ============================================================================
// Lazy Initialization Pattern (prevents startup crashes)
// ============================================================================

let eventConsumerInstance: EventConsumer | null = null;
let initializationError: Error | null = null;

/**
 * Get EventConsumer singleton with lazy initialization
 *
 * This pattern prevents the application from crashing at module load time
 * if KAFKA_BROKERS environment variable is not configured.
 *
 * @returns EventConsumer instance or null if initialization failed
 *
 * @example
 * ```typescript
 * const consumer = getEventConsumer();
 * if (!consumer) {
 *   return res.status(503).json({ error: 'Event consumer not available' });
 * }
 * const metrics = consumer.getAgentMetrics();
 * ```
 */
export function getEventConsumer(): EventConsumer | null {
  // Return cached instance if already initialized
  if (eventConsumerInstance) {
    return eventConsumerInstance;
  }

  // Return null if we previously failed to initialize
  if (initializationError) {
    return null;
  }

  // Attempt lazy initialization
  try {
    eventConsumerInstance = new EventConsumer();
    return eventConsumerInstance;
  } catch (error) {
    initializationError = error instanceof Error ? error : new Error(String(error));
    console.warn('⚠️  EventConsumer initialization failed:', initializationError.message);
    console.warn('   Real-time event streaming will be disabled');
    console.warn('   Set KAFKA_BROKERS in .env file to enable event streaming');
    return null;
  }
}

/**
 * Check if EventConsumer is available without attempting initialization
 * @returns true if EventConsumer is available, false otherwise
 */
export function isEventConsumerAvailable(): boolean {
  return eventConsumerInstance !== null || initializationError === null;
}

/**
 * Get the initialization error if EventConsumer failed to initialize
 * @returns Error object or null if no error
 */
export function getEventConsumerError(): Error | null {
  return initializationError;
}

/**
 * Backward compatibility: Proxy that delegates to lazy getter
 *
 * This allows existing code to continue using `eventConsumer` directly
 * without breaking. The Proxy intercepts all property access and delegates
 * to the lazily-initialized instance.
 *
 * @deprecated Use getEventConsumer() for better error handling
 */
export const eventConsumer = new Proxy({} as EventConsumer, {
  get(target, prop) {
    const instance = getEventConsumer();
    if (!instance) {
      // Return dummy implementations that log warnings
      if (prop === 'validateConnection') {
        return async () => {
          console.warn('⚠️  EventConsumer not available (Kafka not configured)');
          return false;
        };
      }
      if (prop === 'start' || prop === 'stop') {
        return async () => {
          console.warn('⚠️  EventConsumer not available (Kafka not configured)');
        };
      }
      if (prop === 'getHealthStatus') {
        return () => ({
          status: 'unhealthy',
          eventsProcessed: 0,
          recentActionsCount: 0,
          registeredNodesCount: 0,
          timestamp: new Date().toISOString(),
        });
      }
      if (
        prop === 'getAgentMetrics' ||
        prop === 'getRecentActions' ||
        prop === 'getRoutingDecisions' ||
        prop === 'getRecentTransformations' ||
        prop === 'getPerformanceMetrics' ||
        prop === 'getRegisteredNodes' ||
        prop === 'getNodeIntrospectionEvents' ||
        prop === 'getNodeHeartbeatEvents' ||
        prop === 'getNodeStateChangeEvents' ||
        prop === 'getCanonicalNodes'
      ) {
        return () => [];
      }
      if (prop === 'getNodeRegistryStats') {
        return () => ({
          totalNodes: 0,
          activeNodes: 0,
          pendingNodes: 0,
          failedNodes: 0,
          typeDistribution: {},
        });
      }
      if (prop === 'getCanonicalNodeStats') {
        return () => ({
          totalNodes: 0,
          activeNodes: 0,
          pendingNodes: 0,
          offlineNodes: 0,
        });
      }
      if (prop === 'getRegisteredNode' || prop === 'getCanonicalNode') {
        return () => undefined;
      }
      if (prop === 'getPerformanceStats') {
        return () => ({
          totalQueries: 0,
          cacheHitCount: 0,
          avgRoutingDuration: 0,
          totalRoutingDuration: 0,
          cacheHitRate: 0,
        });
      }
      if (prop === 'getActionsByAgent') {
        return () => [];
      }
      // For event emitter methods, return no-op functions
      if (prop === 'on' || prop === 'once' || prop === 'emit' || prop === 'removeListener') {
        return () => eventConsumer; // Return proxy for chaining
      }
      return undefined;
    }
    // Delegate to actual instance
    const value = (instance as any)[prop];
    // Bind methods to the instance to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
