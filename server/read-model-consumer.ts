/**
 * Read-Model Consumer (OMN-2061)
 *
 * Kafka consumer that projects events into the omnidash_analytics database.
 * This is omnidash's own consumer -- deployed as an omnidash artifact.
 *
 * Design:
 * - Append-only projections: events are inserted, never updated in place
 * - Versioned projection rules: projection_watermarks tracks consumer progress
 * - Idempotent: duplicate events are safely ignored via ON CONFLICT
 * - Graceful degradation: if DB is unavailable, events are skipped (Kafka retains them)
 *
 * Topics consumed:
 * - agent-routing-decisions -> agent_routing_decisions table
 * - agent-actions -> agent_actions table
 * - agent-transformation-events -> agent_transformation_events table
 *
 * Note: router-performance-metrics is handled by EventConsumer in
 * event-consumer.ts (in-memory aggregation only, no table needed).
 *
 * The consumer runs alongside the existing EventConsumer (which handles
 * in-memory aggregation for real-time WebSocket delivery). This consumer
 * is responsible for durable persistence into the read-model DB.
 */

import crypto from 'node:crypto';
import { Kafka, Consumer, EachMessagePayload, KafkaMessage } from 'kafkajs';
import { tryGetIntelligenceDb } from './storage';
import { sql } from 'drizzle-orm';
import {
  agentRoutingDecisions,
  agentActions,
  agentTransformationEvents,
} from '@shared/intelligence-schema';
import type {
  InsertAgentRoutingDecision,
  InsertAgentAction,
  InsertAgentTransformationEvent,
} from '@shared/intelligence-schema';
import type { PatternEnforcementEvent } from '@shared/enforcement-types';

/**
 * Derive a deterministic UUID-shaped string from Kafka message coordinates.
 * Uses SHA-256 hash of topic + partition + offset, which uniquely identify
 * a message within a Kafka cluster. This ensures that redelivery of the
 * same message produces the same fallback correlation_id, preserving
 * ON CONFLICT DO NOTHING idempotency.
 */
function deterministicCorrelationId(topic: string, partition: number, offset: string): string {
  return crypto
    .createHash('sha256')
    .update(`${topic}:${partition}:${offset}`)
    .digest('hex')
    .slice(0, 32)
    .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}

/**
 * Parse a date string safely, returning a fallback of `new Date()` when the
 * input is missing or produces an invalid Date (e.g. malformed ISO string).
 */
function safeParseDate(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(value as string);
  return Number.isFinite(d.getTime()) ? d : new Date();
}

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

// Consumer configuration
const CONSUMER_GROUP_ID = process.env.READ_MODEL_CONSUMER_GROUP_ID || 'omnidash-read-model-v1';
const CLIENT_ID = process.env.READ_MODEL_CLIENT_ID || 'omnidash-read-model-consumer';
const RETRY_BASE_DELAY_MS = isTestEnv ? 20 : 2000;
const RETRY_MAX_DELAY_MS = isTestEnv ? 200 : 30000;
const MAX_RETRY_ATTEMPTS = isTestEnv ? 2 : 10;

// Topics this consumer subscribes to
const READ_MODEL_TOPICS = [
  'agent-routing-decisions',
  'agent-actions',
  'agent-transformation-events',
  'onex.evt.omniclaude.pattern-enforcement.v1',
] as const;

type ReadModelTopic = (typeof READ_MODEL_TOPICS)[number];

export interface ReadModelConsumerStats {
  isRunning: boolean;
  eventsProjected: number;
  errorsCount: number;
  lastProjectedAt: Date | null;
  topicStats: Record<string, { projected: number; errors: number }>;
}

/**
 * Read-Model Consumer
 *
 * Projects Kafka events into the omnidash_analytics database tables.
 * Runs as a separate consumer group from the main EventConsumer to ensure
 * independent offset tracking and processing guarantees.
 */
export class ReadModelConsumer {
  private kafka: Kafka | null = null;
  private consumer: Consumer | null = null;
  private running = false;
  private stats: ReadModelConsumerStats = {
    isRunning: false,
    eventsProjected: 0,
    errorsCount: 0,
    lastProjectedAt: null,
    topicStats: {},
  };

  /**
   * Start the read-model consumer.
   * Connects to Kafka and begins consuming events for projection.
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('[ReadModelConsumer] Already running');
      return;
    }

    const brokers = (process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS || '')
      .split(',')
      .filter(Boolean);

    if (brokers.length === 0) {
      console.warn('[ReadModelConsumer] No Kafka brokers configured -- skipping');
      return;
    }

    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[ReadModelConsumer] Database not configured -- skipping');
      return;
    }

    let attempts = 0;
    while (attempts < MAX_RETRY_ATTEMPTS) {
      try {
        this.kafka = new Kafka({
          clientId: CLIENT_ID,
          brokers,
          connectionTimeout: 5000,
          requestTimeout: 10000,
          retry: {
            initialRetryTime: RETRY_BASE_DELAY_MS,
            maxRetryTime: RETRY_MAX_DELAY_MS,
            retries: 3,
          },
        });

        this.consumer = this.kafka.consumer({
          groupId: CONSUMER_GROUP_ID,
          sessionTimeout: 30000,
          heartbeatInterval: 10000,
        });

        await this.consumer.connect();
        console.log('[ReadModelConsumer] Connected to Kafka');

        // Subscribe to all read-model topics.
        // fromBeginning: false is intentional -- we only project events produced
        // after this consumer first joins the group. Historical / pre-existing
        // events must be backfilled separately (e.g., by re-reading from the
        // source database or by temporarily resetting consumer group offsets).
        for (const topic of READ_MODEL_TOPICS) {
          await this.consumer.subscribe({ topic, fromBeginning: false });
        }

        // Process messages
        await this.consumer.run({
          eachMessage: async (payload: EachMessagePayload) => {
            await this.handleMessage(payload);
          },
        });

        this.running = true;
        this.stats.isRunning = true;
        console.log(
          `[ReadModelConsumer] Running. Topics: ${READ_MODEL_TOPICS.join(', ')}. ` +
            `Group: ${CONSUMER_GROUP_ID}`
        );
        return;
      } catch (err) {
        attempts++;
        const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempts), RETRY_MAX_DELAY_MS);
        console.error(
          `[ReadModelConsumer] Connection attempt ${attempts}/${MAX_RETRY_ATTEMPTS} failed:`,
          err instanceof Error ? err.message : err
        );
        if (attempts < MAX_RETRY_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error('[ReadModelConsumer] Failed to connect after max retries');
  }

  /**
   * Stop the consumer gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.consumer) return;

    try {
      await this.consumer.disconnect();
      console.log('[ReadModelConsumer] Disconnected');
    } catch (err) {
      console.error('[ReadModelConsumer] Error during disconnect:', err);
    } finally {
      this.running = false;
      this.stats.isRunning = false;
      this.consumer = null;
      this.kafka = null;
    }
  }

  /**
   * Get consumer statistics.
   */
  getStats(): ReadModelConsumerStats {
    return { ...this.stats };
  }

  /**
   * Handle an incoming Kafka message and project it to the read-model.
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;

    try {
      const parsed = this.parseMessage(message);
      if (!parsed) return;

      const topicKey = topic as ReadModelTopic;
      const fallbackId = deterministicCorrelationId(topic, partition, message.offset);

      let projected: boolean;
      switch (topicKey) {
        case 'agent-routing-decisions':
          projected = await this.projectRoutingDecision(parsed, fallbackId);
          break;
        case 'agent-actions':
          projected = await this.projectAgentAction(parsed, fallbackId);
          break;
        case 'agent-transformation-events':
          projected = await this.projectTransformationEvent(parsed);
          break;
        case 'onex.evt.omniclaude.pattern-enforcement.v1':
          projected = await this.projectEnforcementEvent(parsed, fallbackId);
          break;
        default:
          console.warn(
            `[ReadModelConsumer] Received message on unknown topic "${topic}" -- skipping`
          );
          return;
      }

      // Only update stats and watermark when the projection actually succeeded.
      // If the DB was unavailable the projection method returns false and we
      // must NOT advance the watermark -- Kafka will redeliver the message on
      // the next consumer restart (or when the DB comes back and the next
      // poll cycle retries).
      if (!projected) {
        console.warn(
          `[ReadModelConsumer] DB unavailable, skipping projection for ${topic} ` +
            `partition=${partition} offset=${message.offset}`
        );
        return;
      }

      // Update stats
      this.stats.eventsProjected++;
      this.stats.lastProjectedAt = new Date();
      if (!this.stats.topicStats[topic]) {
        this.stats.topicStats[topic] = { projected: 0, errors: 0 };
      }
      this.stats.topicStats[topic].projected++;

      // Track consumer progress via watermark
      const watermarkName = `${topic}:${partition}`;
      await this.updateWatermark(watermarkName, Number(message.offset));
    } catch (err) {
      this.stats.errorsCount++;
      if (!this.stats.topicStats[topic]) {
        this.stats.topicStats[topic] = { projected: 0, errors: 0 };
      }
      this.stats.topicStats[topic].errors++;

      console.error(
        `[ReadModelConsumer] Error projecting ${topic} message:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  /**
   * Parse a Kafka message value into a JSON object.
   */
  private parseMessage(message: KafkaMessage): Record<string, unknown> | null {
    if (!message.value) return null;

    try {
      const raw = JSON.parse(message.value.toString());
      // Handle envelope pattern: { payload: { ... } }
      if (raw.payload && typeof raw.payload === 'object') {
        return { ...raw.payload, _envelope: raw };
      }
      return raw;
    } catch {
      return null;
    }
  }

  /**
   * Project a routing decision event into agent_routing_decisions table.
   * Returns true if the row was successfully written, false if the DB was unavailable.
   */
  private async projectRoutingDecision(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const row: InsertAgentRoutingDecision = {
      correlationId:
        (data.correlation_id as string) || (data.correlationId as string) || fallbackId,
      sessionId: (data.session_id as string) || (data.sessionId as string) || undefined,
      userRequest: (data.user_request as string) || (data.userRequest as string) || '',
      userRequestHash:
        (data.user_request_hash as string) || (data.userRequestHash as string) || undefined,
      contextSnapshot: data.context_snapshot || data.contextSnapshot || undefined,
      selectedAgent: (data.selected_agent as string) || (data.selectedAgent as string) || 'unknown',
      confidenceScore: String(data.confidence_score ?? data.confidenceScore ?? 0),
      routingStrategy:
        (data.routing_strategy as string) || (data.routingStrategy as string) || 'unknown',
      triggerConfidence:
        data.trigger_confidence != null ? String(data.trigger_confidence) : undefined,
      contextConfidence:
        data.context_confidence != null ? String(data.context_confidence) : undefined,
      capabilityConfidence:
        data.capability_confidence != null ? String(data.capability_confidence) : undefined,
      historicalConfidence:
        data.historical_confidence != null ? String(data.historical_confidence) : undefined,
      alternatives: data.alternatives || undefined,
      reasoning: (data.reasoning as string) || undefined,
      routingTimeMs: Number(data.routing_time_ms ?? data.routingTimeMs ?? 0),
      cacheHit: Boolean(data.cache_hit ?? data.cacheHit ?? false),
      selectionValidated: Boolean(data.selection_validated ?? data.selectionValidated ?? false),
      actualSuccess: data.actual_success != null ? Boolean(data.actual_success) : undefined,
      executionSucceeded:
        data.execution_succeeded != null ? Boolean(data.execution_succeeded) : undefined,
      actualQualityScore:
        data.actual_quality_score != null ? String(data.actual_quality_score) : undefined,
      createdAt: safeParseDate(data.created_at),
    };

    await db
      .insert(agentRoutingDecisions)
      .values(row)
      .onConflictDoNothing({ target: agentRoutingDecisions.correlationId });

    return true;
  }

  /**
   * Project an agent action event into agent_actions table.
   * Returns true if the row was successfully written, false if the DB was unavailable.
   */
  private async projectAgentAction(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const row: InsertAgentAction = {
      correlationId:
        (data.correlation_id as string) || (data.correlationId as string) || fallbackId,
      agentName: (data.agent_name as string) || (data.agentName as string) || 'unknown',
      actionType: (data.action_type as string) || (data.actionType as string) || 'unknown',
      actionName: (data.action_name as string) || (data.actionName as string) || 'unknown',
      actionDetails: data.action_details || data.actionDetails || {},
      debugMode: Boolean(data.debug_mode ?? data.debugMode ?? true),
      durationMs:
        data.duration_ms != null
          ? Number(data.duration_ms)
          : data.durationMs != null
            ? Number(data.durationMs)
            : undefined,
      createdAt: safeParseDate(data.created_at),
    };

    await db
      .insert(agentActions)
      .values(row)
      .onConflictDoNothing({ target: agentActions.correlationId });

    return true;
  }

  /**
   * Project a transformation event into agent_transformation_events table.
   * Returns true if the row was successfully written, false if the DB was unavailable.
   */
  private async projectTransformationEvent(data: Record<string, unknown>): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const row: InsertAgentTransformationEvent = {
      sourceAgent: (data.source_agent as string) || (data.sourceAgent as string) || 'unknown',
      targetAgent: (data.target_agent as string) || (data.targetAgent as string) || 'unknown',
      transformationReason:
        (data.transformation_reason as string) ||
        (data.transformationReason as string) ||
        undefined,
      confidenceScore: data.confidence_score != null ? String(data.confidence_score) : undefined,
      transformationDurationMs:
        data.transformation_duration_ms != null
          ? Number(data.transformation_duration_ms)
          : undefined,
      success: Boolean(data.success ?? true),
      createdAt: safeParseDate(data.created_at),
      projectPath: (data.project_path as string) || (data.projectPath as string) || undefined,
      projectName: (data.project_name as string) || (data.projectName as string) || undefined,
      claudeSessionId:
        (data.claude_session_id as string) || (data.claudeSessionId as string) || undefined,
    };

    // NOTE: The composite key (source_agent, target_agent, created_at) is a
    // best-effort deduplication strategy. Two distinct transformation events
    // between the same agents within the same second-level timestamp will
    // collide and the second will be silently dropped. If transformation
    // events gain a correlation_id or unique event ID in the future, that
    // field should be used as the deduplication target instead.
    await db
      .insert(agentTransformationEvents)
      .values(row)
      .onConflictDoNothing({
        target: [
          agentTransformationEvents.sourceAgent,
          agentTransformationEvents.targetAgent,
          agentTransformationEvents.createdAt,
        ],
      });

    return true;
  }

  /**
   * Project a pattern enforcement event into the `pattern_enforcement_events` table.
   *
   * The table is created by a SQL migration (see migrations/).
   * Returns true when written, false when the DB is unavailable.
   *
   * Deduplication key: (correlation_id) -- each evaluation has a unique correlation ID.
   * Falls back to a deterministic hash when correlation_id is absent.
   */
  private async projectEnforcementEvent(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    // Coerce the raw event into a typed shape
    const evt = data as Partial<PatternEnforcementEvent>;

    const correlationId =
      (evt.correlation_id as string) || (data.correlationId as string) || fallbackId;

    // outcome is required -- a missing value indicates a malformed event.
    // Do NOT default to 'hit' or any other value; that would silently inflate
    // hit counts and corrupt the enforcement metrics.
    if (evt.outcome == null) {
      console.warn(
        '[ReadModelConsumer] Enforcement event missing required "outcome" field ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
      return true; // Treat as "handled" so we advance the watermark
    }
    const outcome = evt.outcome;
    if (!['hit', 'violation', 'corrected', 'false_positive'].includes(outcome)) {
      console.warn('[ReadModelConsumer] Unknown enforcement outcome:', outcome, '-- skipping');
      return true; // Treat as "handled" so we advance the watermark
    }

    try {
      await db.execute(sql`
        INSERT INTO pattern_enforcement_events (
          correlation_id,
          session_id,
          repo,
          language,
          domain,
          pattern_name,
          pattern_lifecycle_state,
          outcome,
          confidence,
          agent_name,
          created_at
        ) VALUES (
          ${correlationId},
          ${(evt.session_id as string) ?? null},
          ${(evt.repo as string) ?? null},
          ${(evt.language as string) ?? 'unknown'},
          ${(evt.domain as string) ?? 'unknown'},
          ${(evt.pattern_name as string) ?? 'unknown'},
          ${(evt.pattern_lifecycle_state as string) ?? null},
          ${outcome},
          ${evt.confidence != null ? Number(evt.confidence) : null},
          ${(evt.agent_name as string) ?? null},
          ${safeParseDate(evt.timestamp)}
        )
        ON CONFLICT (correlation_id) DO NOTHING
      `);
    } catch (err) {
      // If table doesn't exist yet, warn and return true to advance watermark.
      // The table will be created by the migration; until then we skip gracefully.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('pattern_enforcement_events') && msg.includes('does not exist')) {
        console.warn(
          '[ReadModelConsumer] pattern_enforcement_events table not yet created -- ' +
            'run migrations to enable enforcement projection'
        );
        return true;
      }
      throw err;
    }

    return true;
  }

  /**
   * Update projection watermark for tracking consumer progress.
   *
   * Called after each successful message projection in handleMessage().
   * The projection name is formatted as "topic:partition" to track
   * per-partition progress independently.
   */
  private async updateWatermark(projectionName: string, offset: number): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) return;

    try {
      // NOTE: The projection_watermarks table also has an errors_count column,
      // but we intentionally omit it here. Per-watermark error tracking is
      // deferred to a future iteration; for now, errors are tracked in the
      // in-memory ReadModelConsumerStats.errorsCount counter instead.
      await db.execute(sql`
        INSERT INTO projection_watermarks (projection_name, last_offset, events_projected, updated_at)
        VALUES (${projectionName}, ${offset}, 1, NOW())
        ON CONFLICT (projection_name)
        DO UPDATE SET
          last_offset = GREATEST(projection_watermarks.last_offset, EXCLUDED.last_offset),
          events_projected = projection_watermarks.events_projected + 1,
          last_projected_at = NOW(),
          updated_at = NOW()
      `);
    } catch (err) {
      // Non-fatal: watermark tracking is best-effort
      console.warn(
        '[ReadModelConsumer] Failed to update watermark:',
        err instanceof Error ? err.message : err
      );
    }
  }
}

// Singleton instance
export const readModelConsumer = new ReadModelConsumer();
