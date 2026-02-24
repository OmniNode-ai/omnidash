/**
 * Event Bus Data Source
 *
 * Subscribes to all events from Kafka/Redpanda event bus and provides:
 * 1. Event storage in PostgreSQL for historical queries
 * 2. Real-time event streaming via WebSocket
 * 3. Query APIs for data sources to consume events
 * 4. Event transformation to normalized data source formats
 *
 * Architecture:
 * - Subscribes to all topics matching event catalog patterns
 * - Normalizes event envelope structure
 * - Stores events in PostgreSQL with event_type partitioning
 * - Provides query methods for data sources
 * - Emits events for WebSocket broadcasting
 */

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEmitter } from 'events';
import { getIntelligenceDb } from './storage';
import { sql, SQL } from 'drizzle-orm';

/**
 * Normalized event envelope structure matching event catalog
 */
export interface EventBusEvent {
  // Envelope fields (frozen per EVENT_BUS_INTEGRATION_GUIDE.md)
  event_type: string;
  event_id: string;
  timestamp: string;
  tenant_id: string;
  namespace: string;
  source: string;
  correlation_id?: string;
  causation_id?: string;
  schema_ref: string;
  payload: Record<string, any>;

  // Kafka metadata
  topic: string;
  partition: number;
  offset: string;

  // Processing metadata
  processed_at: Date;
  stored_at?: Date;
}

/**
 * Event query options for data sources
 */
export interface EventQueryOptions {
  event_types?: string[];
  tenant_id?: string;
  namespace?: string;
  correlation_id?: string;
  source?: string;
  start_time?: Date;
  end_time?: Date;
  limit?: number;
  offset?: number;
  order_by?: 'timestamp' | 'processed_at';
  order_direction?: 'asc' | 'desc';
}

/**
 * Event aggregation options
 * TODO: Implement aggregateEvents() method to support complex aggregations
 * This interface is reserved for future functionality to support advanced
 * event analytics and aggregation queries.
 */
export interface EventAggregationOptions {
  event_types: string[];
  group_by?: string[];
  aggregate?: {
    field: string;
    function: 'count' | 'sum' | 'avg' | 'min' | 'max';
  };
  start_time?: Date;
  end_time?: Date;
  tenant_id?: string;
}

/**
 * Event statistics
 */
export interface EventStatistics {
  total_events: number;
  events_by_type: Record<string, number>;
  events_by_tenant: Record<string, number>;
  events_per_minute: number;
  oldest_event: Date | null;
  newest_event: Date | null;
}

/**
 * EventBusDataSource - Main class for event bus integration
 *
 * Events emitted:
 * - 'event': When new event is received (EventBusEvent)
 * - 'event:stored': When event is stored in database (EventBusEvent)
 * - 'error': When error occurs (Error)
 * - 'connected': When consumer connects
 * - 'disconnected': When consumer disconnects
 */
export class EventBusDataSource extends EventEmitter {
  private kafka: Kafka;
  private consumer: Consumer | null = null;
  private isRunning = false;
  private isConnected = false;

  // Event type patterns from event catalog
  private readonly EVENT_PATTERNS = [
    // ONEX canonical topics — prefix is optional (matches both dev.onex.* and onex.*)
    /^(?:[^.]+\.)?onex\..*\.v\d+$/,
    // omninode domain topics (prefixed: {env}.omninode.{domain}.*.v{N})
    /^[^.]+\.omninode\.(?:intelligence|agent|metadata|code|node|database|consul|vault|bridge|service|kafka|logging|token|pattern|p2p|metacontext)\..*\.v\d+$/,
    // omniclaude / omniintelligence / omnimemory (prefixed: {env}.omniclaude.*.v{N})
    /^[^.]+\.omni(?:claude|intelligence|memory)\..*\.v\d+$/,
    // archon-intelligence (prefixed: {env}.archon-intelligence.*.v{N})
    /^[^.]+\.archon-intelligence\..*\.v\d+$/,
    // omninode-bridge (prefixed: {env}.omninode-bridge.*.v{N})
    /^[^.]+\.omninode-bridge\..*\.v\d+$/,
    // Legacy flat agent topics (no dots, no prefix)
    /^agent-(?:routing-decisions|actions|transformation-events|manifest-injections)$/,
    /^router-performance-metrics$/,
  ];

  constructor() {
    super();

    const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;
    if (!brokers) {
      throw new Error(
        'KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required. ' +
          'Set it in .env file or export it before starting the server. ' +
          'Example: KAFKA_BROKERS=host:port'
      );
    }

    this.kafka = new Kafka({
      brokers: brokers.split(','),
      clientId: 'omnidash-event-bus-data-source',
    });

    // Consumer group bumped to v2 for canonical topic subscription changes (OMN-1933).
    // New group starts with no committed offsets — expects offset reset on first deploy.
    this.consumer = this.kafka.consumer({
      groupId: 'omnidash-event-bus-datasource-v2',
    });
  }

  /**
   * Validate Kafka broker connection
   */
  async validateConnection(): Promise<boolean> {
    const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;

    if (!brokers) {
      console.error('[EventBusDataSource] KAFKA_BROKERS not configured');
      return false;
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();
      const topics = await admin.listTopics();
      await admin.disconnect();

      console.log(
        `[EventBusDataSource] Kafka broker reachable: ${brokers} (${topics.length} topics)`
      );
      return true;
    } catch (error) {
      console.error(`[EventBusDataSource] Kafka broker unreachable: ${brokers}`, error);
      return false;
    }
  }

  /**
   * Initialize database schema for event storage
   */
  async initializeSchema(): Promise<void> {
    try {
      // Create events table if it doesn't exist
      // Note: "offset" is a reserved keyword in PostgreSQL, so we quote it
      await getIntelligenceDb().execute(sql`
        CREATE TABLE IF NOT EXISTS event_bus_events (
          id BIGSERIAL PRIMARY KEY,
          event_type VARCHAR(255) NOT NULL,
          event_id VARCHAR(255) NOT NULL UNIQUE,
          timestamp TIMESTAMPTZ NOT NULL,
          tenant_id VARCHAR(255) NOT NULL,
          namespace VARCHAR(255),
          source VARCHAR(255) NOT NULL,
          correlation_id VARCHAR(255),
          causation_id VARCHAR(255),
          schema_ref VARCHAR(500),
          payload JSONB NOT NULL,
          topic VARCHAR(255) NOT NULL,
          partition INTEGER NOT NULL,
          "offset" VARCHAR(255) NOT NULL,
          processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Create indexes for common queries
      await getIntelligenceDb().execute(sql`
        CREATE INDEX IF NOT EXISTS idx_event_bus_events_event_type 
        ON event_bus_events(event_type)
      `);

      await getIntelligenceDb().execute(sql`
        CREATE INDEX IF NOT EXISTS idx_event_bus_events_tenant_id 
        ON event_bus_events(tenant_id)
      `);

      await getIntelligenceDb().execute(sql`
        CREATE INDEX IF NOT EXISTS idx_event_bus_events_correlation_id 
        ON event_bus_events(correlation_id)
      `);

      await getIntelligenceDb().execute(sql`
        CREATE INDEX IF NOT EXISTS idx_event_bus_events_timestamp 
        ON event_bus_events(timestamp)
      `);

      await getIntelligenceDb().execute(sql`
        CREATE INDEX IF NOT EXISTS idx_event_bus_events_namespace 
        ON event_bus_events(namespace)
      `);

      // Composite index for common query patterns
      await getIntelligenceDb().execute(sql`
        CREATE INDEX IF NOT EXISTS idx_event_bus_events_type_tenant_time 
        ON event_bus_events(event_type, tenant_id, timestamp)
      `);

      console.log('[EventBusDataSource] Database schema initialized');
    } catch (error) {
      console.error('[EventBusDataSource] Error initializing schema:', error);
      throw error;
    }
  }

  /**
   * Start consuming events from Kafka
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[EventBusDataSource] Already running');
      return;
    }

    try {
      await this.initializeSchema();

      if (!this.consumer) {
        throw new Error('Consumer not initialized');
      }

      await this.consumer.connect();
      this.isConnected = true;
      this.emit('connected');

      // Get all topics and filter by event patterns
      const admin = this.kafka.admin();
      await admin.connect();
      const topics = await admin.listTopics();
      await admin.disconnect();

      // Filter out Kafka internal topics and filter topics that match event patterns
      const internalTopics = ['__consumer_offsets', '__transaction_state', '__schema'];
      const eventTopics = topics.filter((topic) => {
        // Skip Kafka internal topics
        if (internalTopics.some((internal) => topic.startsWith(internal))) {
          return false;
        }
        // Extract event_type from topic (format: {tenant}.omninode.{domain}.v1)
        // Or use topic name directly if it matches pattern
        return this.EVENT_PATTERNS.some((pattern) => pattern.test(topic));
      });

      if (eventTopics.length === 0) {
        console.warn(
          '[EventBusDataSource] No matching event topics found, subscribing to all non-internal topics'
        );
        // Subscribe to all non-internal topics as fallback
        const nonInternalTopics = topics.filter(
          (topic) => !internalTopics.some((internal) => topic.startsWith(internal))
        );
        await this.consumer.subscribe({ topics: nonInternalTopics, fromBeginning: false });
      } else {
        console.log(`[EventBusDataSource] Subscribing to ${eventTopics.length} event topics`);
        await this.consumer.subscribe({ topics: eventTopics, fromBeginning: false });
      }

      // Start consuming messages
      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      this.isRunning = true;
      console.log('[EventBusDataSource] Started consuming events');
    } catch (error) {
      console.error('[EventBusDataSource] Error starting consumer:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Handle incoming Kafka message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    try {
      const { topic, partition, message } = payload;
      const offset = message.offset;

      // Skip Kafka internal topics (they contain binary data, not JSON)
      const internalTopics = ['__consumer_offsets', '__transaction_state', '__schema'];
      if (internalTopics.some((internal) => topic.startsWith(internal))) {
        return; // Silently skip internal topics
      }

      // Parse message value (should be JSON event envelope)
      let eventData: any;
      try {
        const messageValue = message.value?.toString() || '{}';
        // Skip if message is empty or not valid UTF-8
        if (!messageValue || messageValue.trim() === '') {
          return;
        }
        eventData = JSON.parse(messageValue);
      } catch {
        // Only log if it's not an internal topic (we already filtered those)
        console.warn(
          `[EventBusDataSource] Error parsing message from ${topic}:${partition}:${offset} - skipping`
        );
        return;
      }

      // Extract event_type from message (could be in payload or headers)
      const eventType =
        eventData.event_type || message.headers?.['x-event-type']?.toString() || topic; // Fallback to topic name

      // Normalize event envelope
      const normalizedEvent: EventBusEvent = {
        event_type: eventType,
        event_id: eventData.event_id || `${topic}-${partition}-${offset}`,
        timestamp: eventData.timestamp || new Date().toISOString(),
        tenant_id: eventData.tenant_id || message.headers?.['x-tenant']?.toString() || 'default',
        namespace: eventData.namespace || '',
        source: eventData.source || message.headers?.['x-source']?.toString() || 'unknown',
        correlation_id:
          eventData.correlation_id || message.headers?.['x-correlation-id']?.toString(),
        causation_id: eventData.causation_id || message.headers?.['x-causation-id']?.toString(),
        schema_ref: eventData.schema_ref || '',
        payload: eventData.payload || eventData, // Use payload if exists, otherwise whole event
        topic,
        partition,
        offset,
        processed_at: new Date(),
      };

      // Emit event for real-time processing
      this.emit('event', normalizedEvent);

      // Store event in database
      await this.storeEvent(normalizedEvent);

      // Emit stored event
      this.emit('event:stored', normalizedEvent);
    } catch (error) {
      console.error('[EventBusDataSource] Error handling message:', error);
      this.emit('error', error);
    }
  }

  /**
   * Store event in PostgreSQL
   * Public method to allow mock generators to inject events
   */
  async storeEvent(event: EventBusEvent): Promise<void> {
    try {
      await getIntelligenceDb().execute(sql`
        INSERT INTO event_bus_events (
          event_type, event_id, timestamp, tenant_id, namespace, source,
          correlation_id, causation_id, schema_ref, payload,
          topic, partition, "offset", processed_at, stored_at
        ) VALUES (
          ${event.event_type},
          ${event.event_id},
          ${event.timestamp}::timestamptz,
          ${event.tenant_id},
          ${event.namespace || null},
          ${event.source},
          ${event.correlation_id || null},
          ${event.causation_id || null},
          ${event.schema_ref || null},
          ${JSON.stringify(event.payload)}::jsonb,
          ${event.topic},
          ${event.partition},
          ${event.offset},
          ${event.processed_at}::timestamptz,
          NOW()
        )
        ON CONFLICT (event_id) DO NOTHING
      `);
    } catch (error) {
      console.error('[EventBusDataSource] Error storing event:', error);
      // Don't throw - continue processing even if storage fails
    }
  }

  /**
   * Query events from database
   */
  async queryEvents(options: EventQueryOptions = {}): Promise<EventBusEvent[]> {
    try {
      // Build WHERE conditions
      const conditions: SQL[] = [];

      if (options.event_types && options.event_types.length > 0) {
        const eventTypes = options.event_types;
        // Use PostgreSQL ANY() with array for better performance than OR chain
        // Parameterize each value to prevent SQL injection
        const arrayValues = eventTypes.map((_, i) => sql`${eventTypes[i]}`);
        // Build: event_type = ANY(ARRAY[$1, $2, $3, ...])
        // This is more efficient than OR chains for large arrays
        const arrayLiteral = sql.join(arrayValues, sql`, `);
        conditions.push(sql`event_type = ANY(ARRAY[${arrayLiteral}])`);
      }

      if (options.tenant_id) {
        conditions.push(sql`tenant_id = ${options.tenant_id}`);
      }

      if (options.namespace) {
        conditions.push(sql`namespace = ${options.namespace}`);
      }

      if (options.correlation_id) {
        conditions.push(sql`correlation_id = ${options.correlation_id}`);
      }

      if (options.source) {
        conditions.push(sql`source = ${options.source}`);
      }

      if (options.start_time) {
        conditions.push(sql`timestamp >= ${options.start_time}::timestamptz`);
      }

      if (options.end_time) {
        conditions.push(sql`timestamp <= ${options.end_time}::timestamptz`);
      }

      // Build WHERE clause
      let whereClause: SQL;
      if (conditions.length > 0) {
        whereClause = sql`WHERE ${conditions.reduce((acc, condition, index) => {
          if (index === 0) return condition;
          return sql`${acc} AND ${condition}`;
        })}`;
      } else {
        whereClause = sql``;
      }

      // Build ORDER BY clause with whitelist validation to prevent SQL injection
      // Use conditional SQL fragments instead of sql.raw() for extra safety
      const validOrderBy = ['timestamp', 'processed_at', 'stored_at', 'created_at'] as const;
      const validDirection = ['asc', 'desc'] as const;
      const safeOrderBy = validOrderBy.includes(
        (options.order_by || 'timestamp') as (typeof validOrderBy)[number]
      )
        ? ((options.order_by || 'timestamp') as (typeof validOrderBy)[number])
        : 'timestamp';
      const safeDirection = validDirection.includes(
        (options.order_direction || 'desc').toLowerCase() as (typeof validDirection)[number]
      )
        ? ((options.order_direction || 'desc').toLowerCase() as (typeof validDirection)[number])
        : 'desc';

      // Build ORDER BY using conditional fragments (safer than sql.raw)
      const orderByClause =
        safeDirection === 'asc'
          ? safeOrderBy === 'timestamp'
            ? sql`ORDER BY timestamp ASC`
            : safeOrderBy === 'processed_at'
              ? sql`ORDER BY processed_at ASC`
              : safeOrderBy === 'stored_at'
                ? sql`ORDER BY stored_at ASC`
                : sql`ORDER BY created_at ASC`
          : safeOrderBy === 'timestamp'
            ? sql`ORDER BY timestamp DESC`
            : safeOrderBy === 'processed_at'
              ? sql`ORDER BY processed_at DESC`
              : safeOrderBy === 'stored_at'
                ? sql`ORDER BY stored_at DESC`
                : sql`ORDER BY created_at DESC`;

      // Build LIMIT/OFFSET
      const limitClause = options.limit ? sql`LIMIT ${options.limit}` : sql``;
      const offsetClause = options.offset ? sql`OFFSET ${options.offset}` : sql``;

      // Build final query
      // Note: Must quote "offset" column name as it's a reserved keyword
      const query = sql`
        SELECT 
          id, event_type, event_id, timestamp, tenant_id, namespace, source,
          correlation_id, causation_id, schema_ref, payload,
          topic, partition, "offset" as offset, processed_at, stored_at, created_at
        FROM event_bus_events
        ${whereClause}
        ${orderByClause}
        ${limitClause}
        ${offsetClause}
      `;

      const result = await getIntelligenceDb().execute(query);

      return result.rows.map((row: any) => ({
        event_type: row.event_type,
        event_id: row.event_id,
        timestamp: row.timestamp,
        tenant_id: row.tenant_id,
        namespace: row.namespace,
        source: row.source,
        correlation_id: row.correlation_id,
        causation_id: row.causation_id,
        schema_ref: row.schema_ref,
        payload: row.payload,
        topic: row.topic,
        partition: row.partition,
        offset: row.offset,
        processed_at: row.processed_at,
        stored_at: row.stored_at,
      }));
    } catch (error) {
      console.error('[EventBusDataSource] Error querying events:', error);
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getStatistics(timeRange?: { start: Date; end: Date }): Promise<EventStatistics> {
    try {
      const timeFilter = timeRange
        ? sql`WHERE timestamp >= ${timeRange.start}::timestamptz AND timestamp <= ${timeRange.end}::timestamptz`
        : sql``;

      // Get total events and time range
      const totalQuery = sql`
        SELECT 
          COUNT(*) as total_events,
          MIN(timestamp) as oldest_event,
          MAX(timestamp) as newest_event
        FROM event_bus_events
        ${timeFilter}
      `;

      // Get events by type
      const typeQuery = sql`
        SELECT 
          event_type,
          COUNT(*) as count
        FROM event_bus_events
        ${timeFilter}
        GROUP BY event_type
      `;

      // Get events by tenant
      const tenantQuery = sql`
        SELECT 
          tenant_id,
          COUNT(*) as count
        FROM event_bus_events
        ${timeFilter}
        GROUP BY tenant_id
      `;

      const [totalResult, typeResult, tenantResult] = await Promise.all([
        getIntelligenceDb().execute(totalQuery),
        getIntelligenceDb().execute(typeQuery),
        getIntelligenceDb().execute(tenantQuery),
      ]);

      const totalRow = totalResult.rows[0];
      const eventsByType: Record<string, number> = {};
      const eventsByTenant: Record<string, number> = {};

      typeResult.rows.forEach((row: any) => {
        eventsByType[row.event_type] = parseInt(row.count) || 0;
      });

      tenantResult.rows.forEach((row: any) => {
        eventsByTenant[row.tenant_id] = parseInt(row.count) || 0;
      });

      // Calculate events per minute
      let eventsPerMinute = 0;
      if (totalRow.oldest_event && totalRow.newest_event) {
        const timeDiff =
          new Date(totalRow.newest_event as string).getTime() -
          new Date(totalRow.oldest_event as string).getTime();
        const minutes = timeDiff / (1000 * 60);
        if (minutes > 0) {
          eventsPerMinute = parseInt(totalRow.total_events as string) / minutes;
        }
      }

      return {
        total_events: parseInt(totalRow.total_events as string) || 0,
        events_by_type: eventsByType,
        events_by_tenant: eventsByTenant,
        events_per_minute: eventsPerMinute,
        oldest_event: totalRow.oldest_event ? new Date(totalRow.oldest_event as string) : null,
        newest_event: totalRow.newest_event ? new Date(totalRow.newest_event as string) : null,
      };
    } catch (error) {
      console.error('[EventBusDataSource] Error getting statistics:', error);
      throw error;
    }
  }

  /**
   * Stop consuming events
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
      this.isRunning = false;
      this.isConnected = false;
      this.emit('disconnected');
      console.log('[EventBusDataSource] Stopped');
    } catch (error) {
      console.error('[EventBusDataSource] Error stopping:', error);
      throw error;
    }
  }

  /**
   * Check if data source is running
   */
  isActive(): boolean {
    return this.isRunning && this.isConnected;
  }

  /**
   * Inject event directly (for mock generators)
   * Bypasses Kafka and stores event directly
   */
  async injectEvent(event: EventBusEvent): Promise<void> {
    // Emit for real-time processing
    this.emit('event', event);

    // Store in database
    await this.storeEvent(event);

    // Emit stored event
    this.emit('event:stored', event);
  }
}

// ============================================================================
// Lazy Initialization Pattern (prevents startup crashes)
// ============================================================================

let eventBusDataSourceInstance: EventBusDataSource | null = null;
let eventBusInitError: Error | null = null;

/**
 * Get EventBusDataSource singleton with lazy initialization
 *
 * This pattern prevents the application from crashing at module load time
 * when KAFKA_BROKERS is absent. Note: a missing KAFKA_BROKERS is a
 * misconfiguration error — Kafka is required infrastructure. A null return
 * from this function means the application is not connected to Kafka and
 * is in a degraded/error state.
 *
 * @performance Avoid calling in per-request hot paths. On the **first call**,
 * lazy initialization runs the `EventBusDataSource` constructor, which reads
 * environment variables and allocates KafkaJS client objects — synchronous
 * work, but non-trivial on the first invocation. No network I/O occurs during
 * construction; broker connections are established only when `start()` is
 * called. On **subsequent calls** (after initialization is cached), the cost
 * is negligible — a null check on a module-level variable. Prefer calling
 * once at startup and caching the result rather than calling on every request.
 *
 * @returns EventBusDataSource instance or null if initialization failed (error state)
 */
export function getEventBusDataSource(): EventBusDataSource | null {
  // Return cached instance if already initialized
  if (eventBusDataSourceInstance) {
    return eventBusDataSourceInstance;
  }

  // Return null if we previously failed to initialize
  if (eventBusInitError) {
    return null;
  }

  // Attempt lazy initialization
  // Safe: JS is single-threaded, and new Kafka() is synchronous — no concurrent construction possible
  try {
    eventBusDataSourceInstance = new EventBusDataSource();
    return eventBusDataSourceInstance;
  } catch (error) {
    eventBusInitError = error instanceof Error ? error : new Error(String(error));
    console.error('❌ EventBusDataSource initialization failed:', eventBusInitError.message);
    console.error(
      '   Kafka is required infrastructure. Set KAFKA_BROKERS in .env to connect to the Redpanda/Kafka broker.'
    );
    console.error(
      '   Event storage and querying are unavailable — this is an error state, not normal operation.'
    );
    return null;
  }
}

/**
 * Check if EventBusDataSource is available.
 *
 * Triggers lazy initialization if not yet done, then returns true if the
 * singleton was successfully initialized and false if initialization failed
 * (e.g. KAFKA_BROKERS not configured). Safe to call at any time — no prior
 * call to `getEventBusDataSource()` is required.
 *
 * @remarks
 * **Side effect**: Triggers lazy initialization of the singleton if not yet
 * initialized. Calling this function is equivalent to calling
 * `getEventBusDataSource()` plus a null check — both are safe to call at any
 * point.
 *
 * **Behavioral change from pre-lazy-init code**: Previously, `isEventBusDataSourceAvailable()`
 * returned `true` optimistically before any initialization attempt. The current implementation
 * triggers lazy initialization as a side effect on the first call. It returns `true` only after
 * successful initialization completes, and `false` if initialization failed (e.g. KAFKA_BROKERS
 * missing or the EventBusDataSource constructor threw). Callers that previously relied on the
 * optimistic `true` return before initialization must treat `false` as "Kafka unavailable".
 *
 * @performance Avoid calling in per-request hot paths (e.g. health-check
 * endpoints polled frequently, per-request middleware). On the **first call**,
 * lazy initialization runs the `EventBusDataSource` constructor, which reads
 * environment variables and allocates KafkaJS client objects — synchronous
 * work, but non-trivial on the first invocation. No network I/O occurs during
 * construction; broker connections are established only when `start()` is
 * called. On **subsequent calls** (after initialization is cached), the cost
 * is negligible — a null check on a module-level variable. Still, the
 * semantic intent of this function is an initialization probe, not a cheap
 * boolean predicate; callers on hot paths should cache the result after the
 * first successful initialization and avoid calling this function on every
 * request.
 *
 * @example
 * ```typescript
 * // Recommended: check once at startup
 * if (!isEventBusDataSourceAvailable()) {
 *   console.error('EventBusDataSource unavailable — check KAFKA_BROKERS');
 * }
 *
 * // In request handlers, use the getter directly:
 * const ds = getEventBusDataSource();
 * if (!ds) return res.status(503).json({ error: 'Event bus unavailable' });
 * ```
 *
 * @returns `true` if initialization succeeded; `false` if Kafka is not configured or
 *   initialization failed. **Note**: triggers lazy initialization on first call.
 */
export function isEventBusDataSourceAvailable(): boolean {
  // SIDE EFFECT WARNING: Despite the predicate-style name, this function triggers Kafka
  // client allocation on the first call (via getEventBusDataSource()). Subsequent calls
  // are cheap (null-check only). If early, predictable initialization is required — e.g.
  // to surface a KAFKA_BROKERS misconfiguration at a known point rather than on the first
  // incoming request — call this function (or getEventBusDataSource()) once explicitly
  // during server startup (e.g. in server/index.ts or routes.ts after route registration).

  // Trigger lazy initialization if not yet done
  getEventBusDataSource();
  return eventBusDataSourceInstance !== null;
}

/**
 * Get initialization error if EventBusDataSource failed to initialize
 */
export function getEventBusDataSourceError(): Error | null {
  return eventBusInitError;
}

/**
 * Proxy that delegates all property access to the lazily-initialized EventBusDataSource.
 * Returns stub implementations that log errors when Kafka is not configured.
 */
export const eventBusDataSource = new Proxy({} as EventBusDataSource, {
  get(target, prop) {
    const instance = getEventBusDataSource();
    if (!instance) {
      // Return dummy implementations
      if (prop === 'validateConnection') {
        return async () => {
          console.error(
            '❌ EventBusDataSource not available - cannot validate connection. Set KAFKA_BROKERS in .env.'
          );
          return false;
        };
      }
      if (prop === 'start') {
        /**
         * Proxy stub for start() when Kafka is not initialized.
         *
         * Throws asynchronously (consistent with the eventConsumer proxy's start stub)
         * so callers awaiting start() receive a rejected promise rather than a silent
         * undefined return. Kafka is required infrastructure — a missing KAFKA_BROKERS
         * env var is a misconfiguration error, not a graceful-degradation scenario.
         *
         * @throws {Error} Always rejects — Kafka was not configured or failed to
         *   initialize. Set KAFKA_BROKERS in .env and restart the server.
         */
        return async (..._args: unknown[]): Promise<never> => {
          throw new Error(
            '[EventBusDataSource] start() called but Kafka is not available — ' +
              'KAFKA_BROKERS is not configured. Set KAFKA_BROKERS in .env to restore event streaming.'
          );
        };
      }
      if (prop === 'stop') {
        // No-op during shutdown: there is nothing to tear down because Kafka never started.
        return async () => {
          // Intentionally silent — stop() during shutdown when Kafka was never available
          // is a benign no-op and should not pollute logs.
        };
      }
      if (prop === 'initializeSchema') {
        return async () => {
          console.error(
            '❌ EventBusDataSource: schema initialization skipped — Kafka is not available. Set KAFKA_BROKERS in .env to restore event storage.'
          );
        };
      }
      if (prop === 'queryEvents') {
        return async (..._args: unknown[]) => {
          console.warn(
            '[EventBusDataSource] queryEvents called but Kafka is not available — returning empty result. Configure KAFKA_BROKERS and KAFKA_CLIENT_ID.'
          );
          return [];
        };
      }
      if (prop === 'queryEventChains') {
        return async (..._args: unknown[]) => {
          console.warn(
            '[EventBusDataSource] queryEventChains called but Kafka is not available — returning empty result. Configure KAFKA_BROKERS and KAFKA_CLIENT_ID.'
          );
          return [];
        };
      }
      if (prop === 'getStatistics') {
        return async (..._args: unknown[]) => {
          console.warn(
            '[EventBusDataSource] getStatistics called but Kafka is not available — returning zero-value shape. Configure KAFKA_BROKERS and KAFKA_CLIENT_ID.'
          );
          return {
            total_events: 0,
            events_by_type: {},
            events_by_tenant: {},
            events_per_minute: 0,
            oldest_event: null,
            newest_event: null,
          };
        };
      }
      if (prop === 'getEventChainStats') {
        return async () => {
          console.warn(
            '[EventBusDataSource] getEventChainStats called but Kafka is not available — returning zero-value shape. Configure KAFKA_BROKERS and KAFKA_CLIENT_ID.'
          );
          return {
            totalChains: 0,
            completedChains: 0,
            activeChains: 0,
            failedChains: 0,
            avgChainDuration: 0,
            avgEventsPerChain: 0,
          };
        };
      }
      if (prop === 'injectEvent') {
        /**
         * Proxy stub returned when Kafka is not initialized.
         *
         * The real `injectEvent` is async (returns Promise<void>), so this stub
         * mirrors that contract by returning an async function that always rejects.
         * Callers that correctly await the real method will naturally catch this
         * rejection through normal async error handling; no special treatment is
         * required at the call site beyond the standard `await` or `.catch()`.
         *
         * @throws {Error} Always rejects — Kafka was not configured or failed to
         *   initialize. To restore event storage, set KAFKA_BROKERS in .env and
         *   restart the server.
         */
        const uninitializedInjectEvent = async (..._args: unknown[]): Promise<never> => {
          throw new Error(
            '[EventBusDataSource] injectEvent called but Kafka is not available — ' +
              'event cannot be delivered. Set KAFKA_BROKERS in .env to restore event storage.'
          );
        };
        return uninitializedInjectEvent;
      }
      // For EventEmitter methods
      if (prop === 'on' || prop === 'once' || prop === 'emit' || prop === 'removeListener') {
        return (...args: unknown[]) => {
          if (prop === 'on' || prop === 'once') {
            // Registering a listener before start() is called is a normal and expected
            // pattern — components wire up listeners during construction/mount, then the
            // bus is started separately. Log at warn (not error) to avoid flooding startup
            // logs with false-alarm error messages during ordinary initialisation order.
            // The listener was NOT registered — Kafka is unavailable so no events will fire.
            console.warn(
              `[EventBusDataSource] .${prop}() called on stub proxy (event: "${String(args[0])}") — ` +
                'Kafka is not initialized; listener was NOT registered. ' +
                'Set KAFKA_BROKERS in .env to enable real event delivery.'
            );
          } else if (prop === 'removeListener') {
            // No-op: there is nothing to remove because on/once stubs never registered a
            // real listener. Removing a listener that was never registered is a normal
            // cleanup pattern (e.g. React useEffect teardown), so log at warn level to
            // avoid polluting startup/teardown logs with spurious errors.
            console.warn(
              `[EventBusDataSource] .removeListener() called on stub proxy (event: "${String(args[0])}") — ` +
                'no-op because Kafka is not initialized and no listener was ever registered.'
            );
          } else if (prop === 'emit') {
            // No-op: no real EventEmitter exists to dispatch to. Log at error level —
            // actively emitting to an unavailable bus indicates a logic error: the caller
            // should have checked bus availability before attempting to publish an event.
            console.error(
              `[EventBusDataSource] .emit() called on stub proxy (event: "${String(args[0])}") — ` +
                'no-op because Kafka is not initialized; event was not dispatched.'
            );
            // EventEmitter.emit() returns boolean (true if listeners were called).
            // Return false — no listeners exist because Kafka is not initialized.
            return false;
          }
          return eventBusDataSource; // Return proxy for chaining (on/once/removeListener return `this`)
        };
      }
      return undefined;
    }
    // Delegate to actual instance
    const value = (instance as any)[prop];
    // Bind methods to preserve 'this' context
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  },
});
