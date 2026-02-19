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
import { sql, eq } from 'drizzle-orm';
import {
  agentRoutingDecisions,
  agentActions,
  agentTransformationEvents,
  llmCostAggregates,
  baselinesSnapshots,
  baselinesComparisons,
  baselinesTrend,
  baselinesBreakdown,
} from '@shared/intelligence-schema';
import type {
  InsertAgentRoutingDecision,
  InsertAgentAction,
  InsertAgentTransformationEvent,
  InsertLlmCostAggregate,
  InsertBaselinesSnapshot,
  InsertBaselinesComparison,
  InsertBaselinesTrend,
  InsertBaselinesBreakdown,
} from '@shared/intelligence-schema';
import type { PatternEnforcementEvent } from '@shared/enforcement-types';
import { ENRICHMENT_OUTCOMES } from '@shared/enrichment-types';
import type { ContextEnrichmentEvent } from '@shared/enrichment-types';
import { SUFFIX_OMNICLAUDE_CONTEXT_ENRICHMENT } from '@shared/topics';
import { baselinesProjection } from './projection-bootstrap';
import { emitBaselinesUpdate } from './baselines-events';

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
 *
 * RISK: The "now" fallback causes a missing/malformed timestamp to be treated
 * as the current time. For fields like computed_at_utc this can incorrectly
 * rank a malformed event as the "latest" snapshot — callers should treat
 * events that triggered this fallback with suspicion.
 */
function safeParseDate(value: unknown): Date {
  if (!value) {
    console.warn(
      '[ReadModelConsumer] safeParseDate: missing timestamp value, falling back to now()'
    );
    return new Date();
  }
  const d = new Date(value as string);
  if (!Number.isFinite(d.getTime())) {
    console.warn(
      `[ReadModelConsumer] safeParseDate: malformed timestamp "${value}", falling back to now()`
    );
    return new Date();
  }
  return d;
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
  'onex.evt.omniclaude.llm-cost-reported.v1',
  'onex.evt.omnibase-infra.baselines-computed.v1',
  SUFFIX_OMNICLAUDE_CONTEXT_ENRICHMENT,
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
      // fallbackId: deterministic dedup key from partition+offset coordinates.
      // Used when neither correlation_id nor correlationId is present in the event.
      // Edge case: duplicate partition+offset (e.g. Kafka compaction artifact) will
      // silently drop the second event via ON CONFLICT DO NOTHING — acceptable in practice.
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
        case 'onex.evt.omniclaude.llm-cost-reported.v1':
          projected = await this.projectLlmCostEvent(parsed);
          break;
        case 'onex.evt.omnibase-infra.baselines-computed.v1':
          projected = await this.projectBaselinesSnapshot(parsed, partition, message.offset);
          break;
        case SUFFIX_OMNICLAUDE_CONTEXT_ENRICHMENT:
          projected = await this.projectEnrichmentEvent(parsed, fallbackId);
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
    // Returning false means this event will be re-processed when the DB
    // reconnects — the consumer watermark is not advanced.
    if (!db) return false;

    // Coerce the raw event into a typed shape
    const evt = data as Partial<PatternEnforcementEvent>;

    const correlationId =
      (evt.correlation_id as string) ||
      (data.correlationId as string) || // camelCase fallback for producers that serialize without snake_case transform
      fallbackId;

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

    // pattern_name is required -- a missing value indicates a malformed event.
    // Do NOT default to 'unknown'; that would silently aggregate unidentifiable
    // patterns and corrupt per-pattern enforcement metrics.
    const patternName = (evt.pattern_name as string) || (data.patternName as string);
    if (!patternName) {
      console.warn(
        '[ReadModelConsumer] Enforcement event missing required "pattern_name" field ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
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
          ${patternName},
          ${(evt.pattern_lifecycle_state as string) ?? null},
          ${outcome},
          ${evt.confidence != null ? Number(evt.confidence) : null},
          ${(evt.agent_name as string) ?? null},
          ${safeParseDate(evt.timestamp)}
        )
        ON CONFLICT (correlation_id) DO NOTHING
      `);
    } catch (err) {
      // If the table doesn't exist yet, warn and return true to advance the
      // watermark so the consumer is not stuck retrying indefinitely.
      // The table is created by a SQL migration; until that migration runs we
      // degrade gracefully and skip enforcement events.
      //
      // Primary check: PostgreSQL error code 42P01 ("undefined_table").
      // The pg / @neondatabase/serverless driver surfaces this as a `.code`
      // property on the thrown Error object.
      // Fallback string check retained for defensive coverage in case the
      // driver wraps the error in a way that omits the code property.
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('pattern_enforcement_events') && msg.includes('does not exist'))
      ) {
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
   * Project a context enrichment event into the `context_enrichment_events` table.
   *
   * The table is created by SQL migration 0005_context_enrichment_events.sql.
   * Returns true when written, false when the DB is unavailable.
   *
   * Deduplication key: (correlation_id) — each enrichment operation has a
   * unique correlation ID. Falls back to a deterministic hash when absent.
   *
   * GOLDEN METRIC: net_tokens_saved > 0 means the enrichment delivered value.
   * Rows with outcome = 'inflated' are context inflation alerts.
   */
  private async projectEnrichmentEvent(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const evt = data as Partial<ContextEnrichmentEvent>;

    const correlationId =
      (evt.correlation_id as string) || (data.correlationId as string) || fallbackId;

    // outcome is required — missing value indicates a malformed event.
    // Do NOT default; that would silently corrupt enrichment metrics.
    const outcome = evt.outcome;
    if (outcome === undefined) {
      console.warn(
        '[ReadModelConsumer] Enrichment event missing required "outcome" field ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
      return true; // Advance watermark so consumer is not stuck
    }
    if (!(ENRICHMENT_OUTCOMES as readonly string[]).includes(outcome)) {
      console.warn('[ReadModelConsumer] Unknown enrichment outcome:', outcome, '-- skipping');
      return true;
    }

    // channel is required — missing value indicates a malformed event.
    // evt = data as Partial<ContextEnrichmentEvent>, so evt.channel already covers data.channel.
    const channel = evt.channel as string | undefined;
    if (!channel) {
      console.warn(
        '[ReadModelConsumer] Enrichment event missing required "channel" field ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
      return true;
    }

    try {
      await db.execute(sql`
        INSERT INTO context_enrichment_events (
          correlation_id,
          session_id,
          channel,
          model_name,
          cache_hit,
          outcome,
          latency_ms,
          tokens_before,
          tokens_after,
          net_tokens_saved,
          similarity_score,
          quality_score,
          repo,
          agent_name,
          created_at
        ) VALUES (
          ${correlationId},
          ${(evt.session_id as string) ?? null},
          ${channel},
          ${(evt.model_name as string) ?? 'unknown'},
          ${Boolean(evt.cache_hit ?? false)},
          ${outcome},
          ${Number.isNaN(Number(evt.latency_ms)) ? 0 : Number(evt.latency_ms ?? 0)},
          ${Number.isNaN(Number(evt.tokens_before)) ? 0 : Number(evt.tokens_before ?? 0)},
          ${Number.isNaN(Number(evt.tokens_after)) ? 0 : Number(evt.tokens_after ?? 0)},
          ${Number.isNaN(Number(evt.net_tokens_saved)) ? 0 : Number(evt.net_tokens_saved ?? 0)},
          ${evt.similarity_score != null && !Number.isNaN(Number(evt.similarity_score)) ? Number(evt.similarity_score) : null},
          ${evt.quality_score != null && !Number.isNaN(Number(evt.quality_score)) ? Number(evt.quality_score) : null},
          ${(evt.repo as string) ?? null},
          ${(evt.agent_name as string) ?? null},
          ${safeParseDate(evt.timestamp)}
        )
        ON CONFLICT (correlation_id) DO NOTHING
      `);
    } catch (err) {
      // If the table doesn't exist yet (migration not run), degrade gracefully
      // and advance the watermark so the consumer is not stuck retrying.
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('context_enrichment_events') && msg.includes('does not exist'))
      ) {
        console.warn(
          '[ReadModelConsumer] context_enrichment_events table not yet created -- ' +
            'run migrations to enable enrichment projection'
        );
        return true;
      }
      throw err;
    }

    return true;
  }

  /**
   * Project a LLM cost reported event into the `llm_cost_aggregates` table.
   *
   * The event is published by the omniclaude session-ended flow (OMN-2300 / OMN-2238)
   * once per session and carries pre-aggregated token usage and cost data.
   * Each event is inserted as a single row with granularity='hour' so the cost
   * trend queries can bucket them into hourly or daily series via date_trunc().
   *
   * Deduplication: there is no natural unique key on llm_cost_aggregates
   * (multiple events for the same model+session are valid). Deduplication is
   * therefore skipped here — INSERT without ON CONFLICT. Idempotent replay is
   * achieved at the Kafka level via consumer group offset tracking.
   *
   * Returns true when written, false when the DB is unavailable.
   */
  private async projectLlmCostEvent(data: Record<string, unknown>): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    // Resolve bucket_time: use the event timestamp if present, fall back to now.
    const bucketTime = safeParseDate(
      data.bucket_time ?? data.bucketTime ?? data.timestamp ?? data.created_at
    );

    // usage_source must be one of 'API' | 'ESTIMATED' | 'MISSING'.
    // Default to 'API' when absent — the event payload from omniclaude
    // carries API-reported usage by default.
    const usageSourceRaw = (data.usage_source as string) || (data.usageSource as string) || 'API';
    const usageSource = ['API', 'ESTIMATED', 'MISSING'].includes(usageSourceRaw)
      ? usageSourceRaw
      : 'API';

    // granularity must be one of 'hour' | 'day'.
    // Default to 'hour' for unrecognized values. Follow the exact same pattern
    // as the usageSource allowlist validation above.
    const granularityRaw = (data.granularity as string) || 'hour';
    const granularity = ['hour', 'day'].includes(granularityRaw) ? granularityRaw : 'hour';

    const promptTokens = Number(data.prompt_tokens ?? data.promptTokens ?? 0);
    const completionTokens = Number(data.completion_tokens ?? data.completionTokens ?? 0);
    const rawTotalTokens = Number(data.total_tokens ?? data.totalTokens ?? 0);
    const derivedTotal = promptTokens + completionTokens;

    // Token total reconciliation:
    // If the event reports total_tokens = 0 but component counts are non-zero,
    // the upstream producer emitted an inconsistent payload — derive the total
    // from its components so we never store a misleading 0.
    // If all three are non-zero but the reported total disagrees with the sum,
    // log a warning and trust the event-supplied total (don't silently correct it;
    // the upstream source of truth may intentionally differ, e.g. cached tokens).
    let totalTokens: number;
    if (rawTotalTokens === 0 && derivedTotal > 0) {
      totalTokens = derivedTotal;
    } else {
      if (rawTotalTokens !== 0 && derivedTotal !== 0 && rawTotalTokens !== derivedTotal) {
        console.warn(
          `[ReadModelConsumer] LLM cost event token total mismatch: ` +
            `total_tokens=${rawTotalTokens} but prompt_tokens(${promptTokens}) + completion_tokens(${completionTokens}) = ${derivedTotal}. ` +
            `Storing event-supplied total.`
        );
      }
      totalTokens = rawTotalTokens;
    }

    // Coerce cost fields to a finite number, defaulting to 0 for any
    // non-numeric value (including false, '', NaN, Infinity). String(false)
    // would be 'false' which fails PostgreSQL's numeric column constraint, so
    // we must guard against that before passing to Drizzle's decimal type.
    const rawTotalCost = data.total_cost_usd ?? data.totalCostUsd;
    const nTotalCost = Number(rawTotalCost);
    const totalCostUsd = String(Number.isFinite(nTotalCost) ? nTotalCost : 0);

    const rawReportedCost = data.reported_cost_usd ?? data.reportedCostUsd;
    const nReportedCost = Number(rawReportedCost);
    const reportedCostUsd = String(Number.isFinite(nReportedCost) ? nReportedCost : 0);

    const rawEstimatedCost = data.estimated_cost_usd ?? data.estimatedCostUsd;
    const nEstimatedCost = Number(rawEstimatedCost);
    const estimatedCostUsd = String(Number.isFinite(nEstimatedCost) ? nEstimatedCost : 0);

    const row: InsertLlmCostAggregate = {
      bucketTime,
      granularity,
      modelName: (data.model_name as string) || (data.modelName as string) || 'unknown',
      repoName: (data.repo_name as string) || (data.repoName as string) || undefined,
      patternId: (data.pattern_id as string) || (data.patternId as string) || undefined,
      patternName: (data.pattern_name as string) || (data.patternName as string) || undefined,
      sessionId: (data.session_id as string) || (data.sessionId as string) || undefined,
      usageSource,
      requestCount: Number(data.request_count ?? data.requestCount ?? 1),
      promptTokens,
      completionTokens,
      totalTokens,
      totalCostUsd,
      reportedCostUsd,
      estimatedCostUsd,
    };

    // Validate that model_name is not 'unknown' when the event carries one.
    // Check the DERIVED row value rather than the raw event fields — the raw
    // field check (data.model_name == null) misses the case where the event
    // sends model_name: '' which is coerced to 'unknown' by the || fallback.
    if (row.modelName === 'unknown') {
      console.warn(
        '[ReadModelConsumer] LLM cost event missing model_name — inserting as "unknown"'
      );
    }

    try {
      await db.insert(llmCostAggregates).values(row);
    } catch (err) {
      // If the table doesn't exist yet, warn and return true to advance the
      // watermark so the consumer is not stuck retrying indefinitely.
      // The table is created by a SQL migration; until that migration runs we
      // degrade gracefully and skip LLM cost events.
      //
      // Primary check: PostgreSQL error code 42P01 ("undefined_table").
      // The pg / @neondatabase/serverless driver surfaces this as a `.code`
      // property on the thrown Error object.
      // Fallback string check retained for defensive coverage in case the
      // driver wraps the error in a way that omits the code property.
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('llm_cost_aggregates') && msg.includes('does not exist'))
      ) {
        console.warn(
          '[ReadModelConsumer] llm_cost_aggregates table not yet created -- ' +
            'run migrations to enable LLM cost projection'
        );
        return true;
      }
      throw err;
    }

    return true;
  }

  /**
   * Project a baselines snapshot event into the baselines_* tables (OMN-2331).
   *
   * Upserts the snapshot header into baselines_snapshots, then atomically
   * replaces child rows (comparisons, trend, breakdown) for that snapshot_id.
   * The replacement is delete-then-insert: old rows for the same snapshot_id
   * are deleted first so re-delivery of the same event is safe (idempotent).
   *
   * Returns true when written, false when the DB is unavailable.
   */
  private async projectBaselinesSnapshot(
    data: Record<string, unknown>,
    partition: number,
    offset: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    // snapshot_id is required — it is the dedup key.
    // Fall back to a deterministic hash so that malformed events with a missing
    // snapshot_id still produce a stable key (idempotent on replay).
    // NOTE: If this event is later re-delivered with a populated snapshot_id,
    // a second orphaned snapshot row will result (no automatic reconciliation).
    // This hash-based ID is a best-effort fallback for malformed events only.
    const snapshotId =
      (data.snapshot_id as string) ||
      deterministicCorrelationId('baselines-computed', partition, offset);

    const contractVersion = Number(data.contract_version ?? 1);
    const computedAtUtc = safeParseDate(
      data.computed_at_utc ?? data.computedAtUtc ?? data.computed_at
    );
    const windowStartUtc = data.window_start_utc
      ? safeParseDate(data.window_start_utc)
      : data.windowStartUtc
        ? safeParseDate(data.windowStartUtc)
        : null;
    const windowEndUtc = data.window_end_utc
      ? safeParseDate(data.window_end_utc)
      : data.windowEndUtc
        ? safeParseDate(data.windowEndUtc)
        : null;

    // Parse child arrays from the event payload.
    // These may be under camelCase or snake_case keys depending on producer.
    const rawComparisons = Array.isArray(data.comparisons) ? data.comparisons : [];
    const rawTrend = Array.isArray(data.trend) ? data.trend : [];
    const rawBreakdown = Array.isArray(data.breakdown) ? data.breakdown : [];

    try {
      // Upsert the snapshot header and replace child rows atomically inside a
      // single transaction. Keeping all writes together ensures a process crash
      // between the header commit and the child-row writes cannot leave the DB
      // with a snapshot row that has zero child rows (incorrect partial state).
      const snapshotRow: InsertBaselinesSnapshot = {
        snapshotId,
        contractVersion,
        computedAtUtc,
        windowStartUtc: windowStartUtc ?? undefined,
        windowEndUtc: windowEndUtc ?? undefined,
      };

      await db.transaction(async (tx) => {
        // 1. Upsert the snapshot header — first operation in the transaction.
        await tx
          .insert(baselinesSnapshots)
          .values(snapshotRow)
          .onConflictDoUpdate({
            target: baselinesSnapshots.snapshotId,
            set: {
              contractVersion: snapshotRow.contractVersion,
              computedAtUtc: snapshotRow.computedAtUtc,
              windowStartUtc: snapshotRow.windowStartUtc,
              windowEndUtc: snapshotRow.windowEndUtc,
              projectedAt: new Date(),
            },
          });

        // 2. Replace child rows: delete old, insert fresh — all inside the same
        // transaction so a partial failure cannot leave the DB in a mixed state
        // (e.g. comparisons from the new snapshot with trend from the old).
        await tx
          .delete(baselinesComparisons)
          .where(eq(baselinesComparisons.snapshotId, snapshotId));

        if (rawComparisons.length > 0) {
          const comparisonRows: InsertBaselinesComparison[] = (
            rawComparisons as Record<string, unknown>[]
          ).map((c) => ({
            snapshotId,
            patternId: String(c.pattern_id ?? c.patternId ?? ''),
            patternName: String(c.pattern_name ?? c.patternName ?? ''),
            sampleSize: Number(c.sample_size ?? c.sampleSize ?? 0),
            windowStart: String(c.window_start ?? c.windowStart ?? ''),
            windowEnd: String(c.window_end ?? c.windowEnd ?? ''),
            tokenDelta: (c.token_delta ?? c.tokenDelta ?? {}) as Record<string, unknown>,
            timeDelta: (c.time_delta ?? c.timeDelta ?? {}) as Record<string, unknown>,
            retryDelta: (c.retry_delta ?? c.retryDelta ?? {}) as Record<string, unknown>,
            testPassRateDelta: (c.test_pass_rate_delta ?? c.testPassRateDelta ?? {}) as Record<
              string,
              unknown
            >,
            reviewIterationDelta: (c.review_iteration_delta ??
              c.reviewIterationDelta ??
              {}) as Record<string, unknown>,
            recommendation: String(c.recommendation ?? 'shadow'),
            confidence: String(c.confidence ?? 'low'),
            rationale: String(c.rationale ?? ''),
          }));
          await tx.insert(baselinesComparisons).values(comparisonRows);
        }

        await tx.delete(baselinesTrend).where(eq(baselinesTrend.snapshotId, snapshotId));

        if (rawTrend.length > 0) {
          const trendRows: InsertBaselinesTrend[] = (rawTrend as Record<string, unknown>[])
            .filter((t) => {
              const date = t.date ?? t.dateStr;
              if (date == null || date === '') {
                console.warn(
                  '[ReadModelConsumer] Skipping trend row with blank/null date:',
                  JSON.stringify(t)
                );
                return false;
              }
              if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
                console.warn(
                  '[ReadModelConsumer] Skipping trend row with malformed date format (expected YYYY-MM-DD):',
                  JSON.stringify(t)
                );
                return false;
              }
              return true;
            })
            .map((t) => ({
              snapshotId,
              date: String(t.date),
              avgCostSavings: String(Number(t.avg_cost_savings ?? t.avgCostSavings ?? 0)),
              avgOutcomeImprovement: String(
                Number(t.avg_outcome_improvement ?? t.avgOutcomeImprovement ?? 0)
              ),
              comparisonsEvaluated: Number(t.comparisons_evaluated ?? t.comparisonsEvaluated ?? 0),
            }));
          if (trendRows.length > 0) {
            await tx.insert(baselinesTrend).values(trendRows);
          }
        }

        await tx.delete(baselinesBreakdown).where(eq(baselinesBreakdown.snapshotId, snapshotId));

        if (rawBreakdown.length > 0) {
          const breakdownRows: InsertBaselinesBreakdown[] = (
            rawBreakdown as Record<string, unknown>[]
          ).map((b) => ({
            snapshotId,
            action: String(b.action ?? 'shadow'),
            count: Number(b.count ?? 0),
            avgConfidence: String(Number(b.avg_confidence ?? b.avgConfidence ?? 0)),
          }));
          await tx.insert(baselinesBreakdown).values(breakdownRows);
        }
      });

      // Invalidate the baselines projection cache so the next API request
      // returns fresh data from the newly projected snapshot.
      baselinesProjection.reset();

      // Notify WebSocket clients subscribed to the 'baselines' topic.
      // Called here (inside the try block) so clients are only notified when
      // all DB writes have committed successfully.
      emitBaselinesUpdate(snapshotId);

      console.log(
        `[ReadModelConsumer] Projected baselines snapshot ${snapshotId} ` +
          `(${rawComparisons.length} comparisons, ${rawTrend.length} trend points, ` +
          `${rawBreakdown.length} breakdown rows)`
      );
    } catch (err) {
      // Degrade gracefully: if the table doesn't exist yet (migration not run),
      // advance the watermark so the consumer is not stuck retrying indefinitely.
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (pgCode === '42P01' || (msg.includes('baselines_') && msg.includes('does not exist'))) {
        console.warn(
          '[ReadModelConsumer] baselines_* tables not yet created -- ' +
            'run migrations to enable baselines projection'
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
