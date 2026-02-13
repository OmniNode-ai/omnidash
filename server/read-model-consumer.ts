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
 * - router-performance-metrics -> (in-memory only, no table needed)
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

        // Subscribe to all read-model topics
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
    const { topic, message } = payload;

    try {
      const parsed = this.parseMessage(message);
      if (!parsed) return;

      const topicKey = topic as ReadModelTopic;

      switch (topicKey) {
        case 'agent-routing-decisions':
          await this.projectRoutingDecision(parsed);
          break;
        case 'agent-actions':
          await this.projectAgentAction(parsed);
          break;
        case 'agent-transformation-events':
          await this.projectTransformationEvent(parsed);
          break;
        default:
          // Unknown topic -- skip
          return;
      }

      // Update stats
      this.stats.eventsProjected++;
      this.stats.lastProjectedAt = new Date();
      if (!this.stats.topicStats[topic]) {
        this.stats.topicStats[topic] = { projected: 0, errors: 0 };
      }
      this.stats.topicStats[topic].projected++;
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
   */
  private async projectRoutingDecision(data: Record<string, unknown>): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) return;

    const row = {
      correlationId:
        (data.correlation_id as string) || (data.correlationId as string) || crypto.randomUUID(),
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
      executionSucceeded:
        data.execution_succeeded != null ? Boolean(data.execution_succeeded) : undefined,
      actualQualityScore:
        data.actual_quality_score != null ? String(data.actual_quality_score) : undefined,
      createdAt: data.created_at ? new Date(data.created_at as string) : new Date(),
    };

    await db
      .insert(agentRoutingDecisions)
      .values(row as any)
      .onConflictDoNothing({ target: agentRoutingDecisions.correlationId });
  }

  /**
   * Project an agent action event into agent_actions table.
   */
  private async projectAgentAction(data: Record<string, unknown>): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) return;

    const row = {
      correlationId:
        (data.correlation_id as string) || (data.correlationId as string) || crypto.randomUUID(),
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
      createdAt: data.created_at ? new Date(data.created_at as string) : new Date(),
    };

    await db
      .insert(agentActions)
      .values(row as any)
      .onConflictDoNothing({ target: agentActions.correlationId });
  }

  /**
   * Project a transformation event into agent_transformation_events table.
   */
  private async projectTransformationEvent(data: Record<string, unknown>): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) return;

    const row = {
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
      createdAt: data.created_at ? new Date(data.created_at as string) : new Date(),
      projectPath: (data.project_path as string) || (data.projectPath as string) || undefined,
      projectName: (data.project_name as string) || (data.projectName as string) || undefined,
      claudeSessionId:
        (data.claude_session_id as string) || (data.claudeSessionId as string) || undefined,
    };

    await db
      .insert(agentTransformationEvents)
      .values(row as any)
      .onConflictDoNothing({
        target: [
          agentTransformationEvents.sourceAgent,
          agentTransformationEvents.targetAgent,
          agentTransformationEvents.createdAt,
        ],
      });
  }

  /**
   * Update projection watermark for tracking consumer progress.
   *
   * TODO(OMN-2061): Integrate watermark tracking into handleMessage() after
   * successful projection. Currently defined but not invoked -- watermark
   * persistence will be wired in a follow-up iteration once the consumer
   * is validated in staging.
   */
  async updateWatermark(projectionName: string, offset: number): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) return;

    try {
      await db.execute(sql`
        INSERT INTO projection_watermarks (projection_name, last_offset, events_projected, updated_at)
        VALUES (${projectionName}, ${offset}, 1, NOW())
        ON CONFLICT (projection_name)
        DO UPDATE SET
          last_offset = GREATEST(projection_watermarks.last_offset, EXCLUDED.last_offset),
          events_projected = projection_watermarks.events_projected + 1,
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
