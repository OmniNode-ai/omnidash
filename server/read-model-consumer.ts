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
import {
  SUFFIX_OMNICLAUDE_CONTEXT_ENRICHMENT,
  SUFFIX_OMNICLAUDE_LLM_ROUTING_DECISION,
  SUFFIX_OMNICLAUDE_TASK_DELEGATED,
  SUFFIX_OMNICLAUDE_DELEGATION_SHADOW_COMPARISON,
  TOPIC_OMNIINTELLIGENCE_LLM_CALL_COMPLETED,
} from '@shared/topics';
import type { LlmRoutingDecisionEvent } from '@shared/llm-routing-types';
import type { TaskDelegatedEvent, DelegationShadowComparisonEvent } from '@shared/delegation-types';
import { delegationEvents, delegationShadowComparisons } from '@shared/intelligence-schema';
import type {
  InsertDelegationEvent,
  InsertDelegationShadowComparison,
} from '@shared/intelligence-schema';
import { baselinesProjection } from './projection-bootstrap';
import { emitBaselinesUpdate } from './baselines-events';
import { emitLlmRoutingInvalidate } from './llm-routing-events';
import { emitDelegationInvalidate } from './delegation-events';
import { emitEnrichmentInvalidate } from './enrichment-events';

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
 * Parse a date string safely, returning the current wall-clock time (`new
 * Date()`) when the input is missing or produces an invalid Date (e.g.
 * malformed ISO string).
 *
 * Wall-clock is used as the fallback so that rows with a missing/malformed
 * timestamp are stored with a "reasonable recent" time rather than 1970-01-01,
 * which would make them appear as the oldest records in the system.
 *
 * Use `safeParseDateOrMin` instead when epoch-zero (sorting last as oldest) is
 * the desired sentinel — currently only for `computedAtUtc` in baselines
 * snapshots.
 */
function safeParseDate(value: unknown): Date {
  if (!value) {
    return new Date();
  }
  const d = new Date(value as string);
  if (!Number.isFinite(d.getTime())) {
    console.warn(
      `[ReadModelConsumer] safeParseDate: malformed timestamp "${value}", falling back to wall-clock`
    );
    return new Date();
  }
  return d;
}

/**
 * Parse a date string safely, returning epoch-zero (`new Date(0)`) when the
 * input is missing or produces an invalid Date (e.g. malformed ISO string).
 *
 * Epoch-zero is used as a min-date sentinel so that rows with a
 * missing/malformed timestamp sort last (oldest) rather than first (newest)
 * when the field is used as an ordering key such as MAX(computed_at_utc) for
 * "latest snapshot". A wall-clock fallback would incorrectly rank a malformed
 * event as the most recent snapshot, hiding correct data from callers.
 *
 * Only use this variant for fields where epoch-zero-as-oldest is intentional.
 * Use `safeParseDate` for all other timestamp fields.
 */
function safeParseDateOrMin(value: unknown): Date {
  if (!value) {
    console.warn(
      '[ReadModelConsumer] safeParseDateOrMin: missing timestamp value, falling back to epoch-zero'
    );
    return new Date(0);
  }
  const d = new Date(value as string);
  if (!Number.isFinite(d.getTime())) {
    console.warn(
      `[ReadModelConsumer] safeParseDateOrMin: malformed timestamp "${value}", falling back to epoch-zero`
    );
    return new Date(0);
  }
  // Extra guard: a valid-but-suspiciously-old date (before 2020) almost
  // certainly indicates a malformed value (e.g. an accidental epoch-seconds
  // value interpreted as milliseconds). Treat it as missing.
  if (d.getFullYear() < 2020) {
    console.warn(
      `[ReadModelConsumer] safeParseDateOrMin: timestamp "${value}" parsed to year ${d.getFullYear()} (< 2020), treating as epoch-zero sentinel`
    );
    return new Date(0);
  }
  return d;
}

const isTestEnv = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

// UUID validation regex — hoisted to module scope so it is compiled once rather
// than once per Kafka message inside projectBaselinesSnapshot().
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL hard limit is 65535 parameters per query.
// The widest baselines child table (comparisons) has 14 explicit user params
// (snapshotId, patternId, patternName, sampleSize, windowStart, windowEnd,
//  tokenDelta, timeDelta, retryDelta, testPassRateDelta, reviewIterationDelta,
//  recommendation, confidence, rationale — DB handles id and createdAt).
// floor(65535 / 14) = 4681 safe rows. Use 4000 as a conservative cap with margin.
const MAX_BATCH_ROWS = 4000;

// Hoisted to module scope — shared by both comparison and breakdown writers so validation
// is applied consistently at ingest time (write-time) rather than silently at read-time.
const VALID_PROMOTION_ACTIONS = new Set(['promote', 'shadow', 'suppress', 'fork']);
const VALID_CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

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
  // OMN-2371 (GAP-5): Canonical producer is NodeLlmInferenceEffect in omnibase_infra.
  // The old topic 'onex.evt.omniclaude.llm-cost-reported.v1' had zero producers.
  // Now subscribing to the canonical per-call topic; projectLlmCostEvent() handles
  // ContractLlmCallMetrics payload and projects each call into llm_cost_aggregates.
  TOPIC_OMNIINTELLIGENCE_LLM_CALL_COMPLETED,
  'onex.evt.omnibase-infra.baselines-computed.v1',
  SUFFIX_OMNICLAUDE_CONTEXT_ENRICHMENT,
  SUFFIX_OMNICLAUDE_LLM_ROUTING_DECISION,
  SUFFIX_OMNICLAUDE_TASK_DELEGATED,
  SUFFIX_OMNICLAUDE_DELEGATION_SHADOW_COMPARISON,
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
  /**
   * Set to true by stop() as soon as a shutdown is requested.
   * The start() retry loop checks this flag before each connection attempt and
   * before sleeping between retries so that a SIGTERM/SIGINT arriving mid-retry
   * cannot race a new this.consumer.connect() call against the disconnect
   * performed inside stop().
   */
  private stopped = false;
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
    // Reset the stopped flag on each start() call so that a consumer can be
    // restarted after a previous stop() (e.g., in tests).
    this.stopped = false;

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
      // Abort the retry loop immediately if stop() was called while we were
      // sleeping between retries. Without this check a connect() call could
      // race against the disconnect() already performed inside stop().
      if (this.stopped) {
        console.log('[ReadModelConsumer] Stop requested -- aborting retry loop');
        return;
      }

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
          // Check the stopped flag once more before sleeping so a stop() call
          // that arrives in the same event-loop tick as the error is honoured
          // without waiting out the full backoff delay.
          if (this.stopped) {
            console.log('[ReadModelConsumer] Stop requested -- aborting retry loop');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.error('[ReadModelConsumer] Failed to connect after max retries');
  }

  /**
   * Stop the consumer gracefully.
   *
   * Sets the stopped flag synchronously before any async work so that the
   * start() retry loop sees it immediately and will not attempt another
   * this.consumer.connect() call after we return from this method.
   */
  async stop(): Promise<void> {
    // Set the abort flag first, before any await, so the start() retry loop
    // observes it as soon as the current microtask checkpoint is reached even
    // when stop() is called while start() is sleeping between retry attempts.
    this.stopped = true;

    if (!this.running && !this.consumer) return;

    try {
      if (this.consumer) {
        await this.consumer.disconnect();
      }
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
        case TOPIC_OMNIINTELLIGENCE_LLM_CALL_COMPLETED:
          projected = await this.projectLlmCostEvent(parsed);
          break;
        case 'onex.evt.omnibase-infra.baselines-computed.v1':
          projected = await this.projectBaselinesSnapshot(parsed, partition, message.offset);
          break;
        case SUFFIX_OMNICLAUDE_CONTEXT_ENRICHMENT:
          projected = await this.projectEnrichmentEvent(parsed, fallbackId);
          break;
        case SUFFIX_OMNICLAUDE_LLM_ROUTING_DECISION:
          projected = await this.projectLlmRoutingDecisionEvent(parsed, fallbackId);
          break;
        case SUFFIX_OMNICLAUDE_TASK_DELEGATED:
          projected = await this.projectTaskDelegatedEvent(parsed, fallbackId);
          break;
        case SUFFIX_OMNICLAUDE_DELEGATION_SHADOW_COMPARISON:
          projected = await this.projectDelegationShadowComparisonEvent(parsed, fallbackId);
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
    if (outcome == null) {
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

    let insertedRowCount = 0;
    try {
      const result = await db.execute(sql`
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
      // db.execute() with raw SQL returns the underlying pg/Neon QueryResult,
      // which carries `rowCount`: the number of rows actually written by the
      // INSERT.  When the ON CONFLICT … DO NOTHING clause suppresses a
      // duplicate the command completes without error but rowCount is 0.
      //
      // The pg socket driver initialises rowCount to null and populates it
      // from the CommandComplete message; the Neon HTTP driver always returns
      // a numeric rowCount.  Both paths therefore produce number | null.
      //
      // We avoid a blind `as { rowCount?: number | null }` cast, which would
      // silently evaluate to 0 if the result object has an unexpected shape
      // (e.g. a future Drizzle version wraps the raw result differently).
      // Instead we use a typeof guard so that any shape mismatch is visible
      // as a NaN/undefined at runtime rather than a silent zero.
      const rawRowCount = (result as unknown as Record<string, unknown>).rowCount;
      if (typeof rawRowCount === 'number') {
        insertedRowCount = rawRowCount;
      } else {
        console.warn(
          `[ReadModelConsumer] enrichment INSERT: rowCount not found in result shape — WebSocket invalidation suppressed. Shape may have changed. Actual type: ${typeof rawRowCount}, keys: ${Object.keys((result as unknown as Record<string, unknown>) ?? {}).join(', ')}`
        );
        // TODO(OMN-2373): Add a structured metric/counter here so shape changes are
        // detectable in production monitoring without requiring log scraping.
        insertedRowCount = 0;
      }
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

    // Notify WebSocket clients subscribed to the 'enrichment' topic only when
    // a new row was genuinely inserted (rowCount > 0).  When the ON CONFLICT
    // clause suppresses a duplicate the insert is a no-op and rowCount is 0;
    // emitting in that case would cause spurious WebSocket invalidation
    // broadcasts on every duplicate event. (OMN-2373)
    if (insertedRowCount > 0) {
      // Wrapped defensively: a failure here must not block watermark advancement.
      try {
        emitEnrichmentInvalidate(correlationId);
      } catch (e) {
        console.warn('[ReadModelConsumer] emitEnrichmentInvalidate() failed post-commit:', e);
      }
    }

    return true;
  }

  /**
   * Project an LLM routing decision event into the `llm_routing_decisions` table (OMN-2279).
   *
   * The table is created by SQL migration 0006_llm_routing_decisions.sql.
   * Returns true when written, false when the DB is unavailable.
   *
   * Deduplication key: (correlation_id) — each routing decision has a unique
   * correlation ID. Falls back to a deterministic hash when absent.
   *
   * GOLDEN METRIC: agreement_rate (agreed / (agreed + disagreed)) > 60%.
   * Alert if disagreement rate exceeds 40%.
   */
  private async projectLlmRoutingDecisionEvent(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const evt = data as Partial<LlmRoutingDecisionEvent>;

    const correlationId =
      (evt.correlation_id as string) || (data.correlationId as string) || fallbackId;

    // llm_agent and fuzzy_agent are required fields.
    const llmAgent = (evt.llm_agent as string) || (data.llmAgent as string);
    const fuzzyAgent = (evt.fuzzy_agent as string) || (data.fuzzyAgent as string);
    if (!llmAgent || !fuzzyAgent) {
      console.warn(
        '[ReadModelConsumer] LLM routing decision event missing required agent fields ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
      // Intentionally return true (advance the watermark) rather than throwing or
      // routing to a dead-letter queue. This follows the established pattern used
      // throughout this consumer for unrecoverable schema violations: logging a
      // warning and moving on keeps the consumer unblocked and prevents a single
      // malformed event from stalling the entire projection. If dead-letter queue
      // support is added in the future, replace this return with a DLQ publish.
      return true;
    }

    // routing_prompt_version is required — missing value makes longitudinal
    // comparison by version impossible. Default to 'unknown' rather than
    // dropping the event so overall agreement_rate metrics remain accurate.
    const routingPromptVersion =
      (evt.routing_prompt_version as string) || (data.routingPromptVersion as string) || 'unknown';

    const agreement = evt.agreement != null ? Boolean(evt.agreement) : llmAgent === fuzzyAgent;

    try {
      await db.execute(sql`
        INSERT INTO llm_routing_decisions (
          correlation_id,
          session_id,
          llm_agent,
          fuzzy_agent,
          agreement,
          llm_confidence,
          fuzzy_confidence,
          llm_latency_ms,
          fuzzy_latency_ms,
          used_fallback,
          routing_prompt_version,
          intent,
          model,
          cost_usd,
          created_at
        ) VALUES (
          ${correlationId},
          ${(evt.session_id as string) ?? null},
          ${llmAgent},
          ${fuzzyAgent},
          ${agreement},
          ${evt.llm_confidence != null && !Number.isNaN(Number(evt.llm_confidence)) ? Number(evt.llm_confidence) : null},
          ${evt.fuzzy_confidence != null && !Number.isNaN(Number(evt.fuzzy_confidence)) ? Number(evt.fuzzy_confidence) : null},
          ${Number.isNaN(Number(evt.llm_latency_ms)) ? 0 : Math.round(Number(evt.llm_latency_ms ?? 0))},
          ${Number.isNaN(Number(evt.fuzzy_latency_ms)) ? 0 : Math.round(Number(evt.fuzzy_latency_ms ?? 0))},
          ${Boolean(evt.used_fallback ?? false)},
          ${routingPromptVersion},
          ${(evt.intent as string) ?? null},
          ${(evt.model as string) ?? null},
          ${evt.cost_usd != null && !Number.isNaN(Number(evt.cost_usd)) ? Number(evt.cost_usd) : null},
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
        (msg.includes('llm_routing_decisions') && msg.includes('does not exist'))
      ) {
        console.warn(
          '[ReadModelConsumer] llm_routing_decisions table not yet created -- ' +
            'run migrations to enable LLM routing projection'
        );
        return true;
      }
      throw err;
    }

    // Notify WebSocket clients subscribed to the 'llm-routing' topic.
    // Called here (after the try/catch) so clients are only notified when
    // the DB write has committed successfully.
    emitLlmRoutingInvalidate(correlationId);

    return true;
  }

  /**
   * Project a task-delegated event into the `delegation_events` table (OMN-2284).
   *
   * Deduplication key: (correlation_id) — each delegation has a unique correlation ID.
   * Falls back to a deterministic hash when absent.
   *
   * GOLDEN METRIC: quality_gate_pass_rate > 80%.
   */
  private async projectTaskDelegatedEvent(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const evt = data as Partial<TaskDelegatedEvent>;

    const correlationId =
      (evt.correlation_id as string) || (data.correlationId as string) || fallbackId;

    const taskType = (evt.task_type as string) || (data.taskType as string);
    const delegatedTo = (evt.delegated_to as string) || (data.delegatedTo as string);
    if (!taskType || !delegatedTo) {
      console.warn(
        '[ReadModelConsumer] task-delegated event missing required fields ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
      return true;
    }

    const row: InsertDelegationEvent = {
      correlationId,
      sessionId: (evt.session_id as string) || (data.sessionId as string) || null,
      timestamp: safeParseDate(evt.timestamp),
      taskType,
      delegatedTo,
      delegatedBy: (evt.delegated_by as string) || (data.delegatedBy as string) || null,
      qualityGatePassed: Boolean(evt.quality_gate_passed ?? data.qualityGatePassed ?? false),
      qualityGatesChecked: evt.quality_gates_checked ?? data.qualityGatesChecked ?? null,
      qualityGatesFailed: evt.quality_gates_failed ?? data.qualityGatesFailed ?? null,
      costUsd: (() => {
        const v = evt.cost_usd ?? data.costUsd;
        return v != null && !Number.isNaN(Number(v)) ? String(Number(v)) : null;
      })(),
      costSavingsUsd: (() => {
        const v = evt.cost_savings_usd ?? data.costSavingsUsd;
        return v != null && !Number.isNaN(Number(v)) ? String(Number(v)) : null;
      })(),
      delegationLatencyMs: (() => {
        const v = evt.delegation_latency_ms ?? data.delegationLatencyMs;
        return v != null && !Number.isNaN(Number(v)) ? Math.round(Number(v)) : null;
      })(),
      repo: (evt.repo as string) || (data.repo as string) || null,
      isShadow: Boolean(evt.is_shadow ?? data.isShadow ?? false),
    };

    try {
      await db
        .insert(delegationEvents)
        .values(row)
        .onConflictDoNothing({ target: delegationEvents.correlationId });
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('delegation_events') && msg.includes('does not exist'))
      ) {
        console.warn(
          '[ReadModelConsumer] delegation_events table not yet created -- ' +
            'run migrations to enable delegation projection'
        );
        return true;
      }
      throw err;
    }

    emitDelegationInvalidate(correlationId);
    return true;
  }

  /**
   * Project a delegation-shadow-comparison event into the
   * `delegation_shadow_comparisons` table (OMN-2284).
   *
   * Deduplication key: (correlation_id) — each comparison has a unique correlation ID.
   */
  private async projectDelegationShadowComparisonEvent(
    data: Record<string, unknown>,
    fallbackId: string
  ): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    const evt = data as Partial<DelegationShadowComparisonEvent>;

    const correlationId =
      (evt.correlation_id as string) || (data.correlationId as string) || fallbackId;

    const taskType = (evt.task_type as string) || (data.taskType as string);
    const primaryAgent = (evt.primary_agent as string) || (data.primaryAgent as string);
    const shadowAgent = (evt.shadow_agent as string) || (data.shadowAgent as string);
    if (!taskType || !primaryAgent || !shadowAgent) {
      console.warn(
        '[ReadModelConsumer] delegation-shadow-comparison event missing required fields ' +
          `(correlation_id=${correlationId}) -- skipping malformed event`
      );
      return true;
    }

    const row: InsertDelegationShadowComparison = {
      correlationId,
      sessionId: (evt.session_id as string) || (data.sessionId as string) || null,
      timestamp: safeParseDate(evt.timestamp),
      taskType,
      primaryAgent,
      shadowAgent,
      divergenceDetected: Boolean(evt.divergence_detected ?? data.divergenceDetected ?? false),
      divergenceScore: (() => {
        const v = evt.divergence_score ?? data.divergenceScore;
        return v != null && !Number.isNaN(Number(v)) ? String(Number(v)) : null;
      })(),
      primaryLatencyMs: (() => {
        const v = evt.primary_latency_ms ?? data.primaryLatencyMs;
        return v != null && !Number.isNaN(Number(v)) ? Math.round(Number(v)) : null;
      })(),
      shadowLatencyMs: (() => {
        const v = evt.shadow_latency_ms ?? data.shadowLatencyMs;
        return v != null && !Number.isNaN(Number(v)) ? Math.round(Number(v)) : null;
      })(),
      primaryCostUsd: (() => {
        const v = evt.primary_cost_usd ?? data.primaryCostUsd;
        return v != null && !Number.isNaN(Number(v)) ? String(Number(v)) : null;
      })(),
      shadowCostUsd: (() => {
        const v = evt.shadow_cost_usd ?? data.shadowCostUsd;
        return v != null && !Number.isNaN(Number(v)) ? String(Number(v)) : null;
      })(),
      divergenceReason:
        (evt.divergence_reason as string) || (data.divergenceReason as string) || null,
    };

    try {
      await db
        .insert(delegationShadowComparisons)
        .values(row)
        .onConflictDoNothing({ target: delegationShadowComparisons.correlationId });
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('delegation_shadow_comparisons') && msg.includes('does not exist'))
      ) {
        console.warn(
          '[ReadModelConsumer] delegation_shadow_comparisons table not yet created -- ' +
            'run migrations to enable delegation shadow projection'
        );
        return true;
      }
      throw err;
    }

    emitDelegationInvalidate(correlationId);
    return true;
  }

  /**
   * Project a LLM call completed event into the `llm_cost_aggregates` table.
   *
   * OMN-2371 (GAP-5): Previously consumed 'onex.evt.omniclaude.llm-cost-reported.v1'
   * which had zero producers. Now consuming the canonical topic
   * 'onex.evt.omniintelligence.llm-call-completed.v1' emitted by NodeLlmInferenceEffect
   * in omnibase_infra per each LLM API call.
   *
   * Payload schema: ContractLlmCallMetrics (omnibase_spi/contracts/measurement)
   *   - model_id: string — LLM model identifier
   *   - prompt_tokens / completion_tokens / total_tokens: number
   *   - estimated_cost_usd: number | null — the only cost field in this contract
   *   - usage_normalized: { source: 'API'|'ESTIMATED'|'MISSING', ... } | null
   *   - usage_is_estimated: boolean — top-level estimation flag
   *   - timestamp_iso: ISO-8601 string — call timestamp
   *   - reporting_source: string — provenance label (e.g. 'pipeline-agent', repo name)
   *
   * Each event maps to a single llm_cost_aggregates row with granularity='hour'.
   * The cost trend queries bucket rows via date_trunc() on bucket_time.
   *
   * Deduplication: no natural unique key exists on llm_cost_aggregates
   * (multiple calls for the same model+session are valid). INSERT without ON CONFLICT;
   * idempotency is achieved via Kafka consumer group offset tracking.
   *
   * Returns true when written, false when the DB is unavailable.
   */
  private async projectLlmCostEvent(data: Record<string, unknown>): Promise<boolean> {
    const db = tryGetIntelligenceDb();
    if (!db) return false;

    // Resolve bucket_time from ContractLlmCallMetrics.timestamp_iso or fallbacks.
    // ContractLlmCallMetrics uses 'timestamp_iso' as the primary timestamp field.
    const bucketTime = safeParseDate(
      data.timestamp_iso ?? data.bucket_time ?? data.bucketTime ?? data.timestamp ?? data.created_at
    );

    // usage_source: prefer the nested usage_normalized.source (ContractLlmCallMetrics schema),
    // then fall back to top-level usage_source / usageSource (legacy schema compat).
    // Must be one of 'API' | 'ESTIMATED' | 'MISSING'.
    const usageNormalized = data.usage_normalized as Record<string, unknown> | null | undefined;
    const usageSourceRaw =
      (usageNormalized?.source as string) ||
      (data.usage_source as string) ||
      (data.usageSource as string) ||
      (data.usage_is_estimated ? 'ESTIMATED' : 'API');
    const usageSourceUpper = usageSourceRaw.toUpperCase();
    const validUsageSources = ['API', 'ESTIMATED', 'MISSING'] as const;
    const usageSource = validUsageSources.includes(
      usageSourceUpper as (typeof validUsageSources)[number]
    )
      ? (usageSourceUpper as 'API' | 'ESTIMATED' | 'MISSING')
      : 'API';
    if (
      !validUsageSources.includes(usageSourceUpper as (typeof validUsageSources)[number]) &&
      usageSourceRaw
    ) {
      console.warn(
        `[ReadModelConsumer] LLM cost event has unrecognised usage_source "${usageSourceRaw}" — defaulting to "API"`
      );
    }

    // granularity: always 'hour' for per-call events from ContractLlmCallMetrics.
    // Pre-aggregated events may carry an explicit 'day' granularity — respect it.
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

    // Cost field mapping for ContractLlmCallMetrics:
    // The contract only has estimated_cost_usd (no separate reported_cost_usd).
    // When a payload has no explicit total_cost_usd / totalCostUsd, fall back to
    // rawEstimatedCost so the cost-trend dashboard has a meaningful total value.
    // Legacy pre-aggregated events may carry explicit total_cost_usd / reported_cost_usd.
    //
    // Coerce to finite number, defaulting to 0 for any non-numeric value (including
    // false, '', NaN, Infinity). String(false) → 'false' fails PostgreSQL numeric columns.
    const rawEstimatedCost = data.estimated_cost_usd ?? data.estimatedCostUsd;
    const nEstimatedCost = Number(rawEstimatedCost);
    const estimatedCostUsd = String(Number.isFinite(nEstimatedCost) ? nEstimatedCost : 0);

    const rawTotalCost = data.total_cost_usd ?? data.totalCostUsd ?? rawEstimatedCost;
    const nTotalCost = Number(rawTotalCost);
    const totalCostUsd = String(Number.isFinite(nTotalCost) ? nTotalCost : 0);

    const rawReportedCost = data.reported_cost_usd ?? data.reportedCostUsd;
    const nReportedCost = Number(rawReportedCost);
    // reported_cost_usd: use explicit field if present, else fall back to 0.
    // ContractLlmCallMetrics does not carry reported_cost_usd separately.
    const reportedCostUsd = String(Number.isFinite(nReportedCost) ? nReportedCost : 0);

    // model_name: ContractLlmCallMetrics uses 'model_id'; also accept 'model_name' for
    // legacy compatibility.
    const modelName =
      (data.model_id as string) ||
      (data.model_name as string) ||
      (data.modelName as string) ||
      'unknown';

    // repo_name: ContractLlmCallMetrics uses 'reporting_source' as the provenance label.
    // Expected value space: short, slug-style identifiers such as 'omniclaude',
    // 'omniclaude-node', or 'pipeline-agent' — the canonical name of the service or
    // repository that emitted the event.  These identifiers contain no whitespace and
    // are well under 64 characters, so we use those two properties as a heuristic to
    // distinguish a valid repo name from a free-form description that a producer may
    // occasionally put in reporting_source.  Limitation: a descriptive string that
    // happens to be short and space-free (e.g. "adhoc") would also pass — but that is
    // an acceptable false-positive because the field still provides a useful grouping
    // key in the cost-aggregate table.  Explicit repo_name / repoName fields from
    // legacy payloads always take precedence and bypass this heuristic entirely.
    const reportingSource = (data.reporting_source as string) || (data.reportingSource as string);
    const explicitRepo = (data.repo_name as string) || (data.repoName as string);
    const repoName =
      explicitRepo ||
      (reportingSource && reportingSource.length < 64 && !/\s/.test(reportingSource)
        ? reportingSource
        : undefined);

    const row: InsertLlmCostAggregate = {
      bucketTime,
      granularity,
      modelName,
      repoName,
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
    // field check (data.model_id == null) misses the case where the event
    // sends model_id: '' which is coerced to 'unknown' by the || fallback.
    if (row.modelName === 'unknown') {
      console.warn(
        '[ReadModelConsumer] LLM cost event missing model_id/model_name — inserting as "unknown"'
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
    // Fall back to a deterministic hash when snapshot_id is absent OR when it
    // is present but not a valid UUID (e.g. a slug or opaque string). PostgreSQL
    // uuid primary key columns reject malformed values with a runtime error; a
    // truthy-but-non-UUID snapshot_id would bypass the falsy guard below and
    // crash the DB transaction.
    // NOTE: If this event is later re-delivered with a valid snapshot_id,
    // a second orphaned snapshot row will result (no automatic reconciliation).
    // This hash-based ID is a best-effort fallback for malformed events only.
    const rawSnapshotId = data.snapshot_id as string | undefined;
    const snapshotId =
      rawSnapshotId && UUID_RE.test(rawSnapshotId)
        ? rawSnapshotId
        : deterministicCorrelationId('baselines-computed', partition, offset);

    // String(null) → 'null', String(undefined) → 'undefined', String(0) → '0'.
    // parseInt('null', 10) and parseInt('undefined', 10) both return NaN, which
    // falls through to the || 1 default. A previous ?? '' guard was dead code:
    // String() never produces '' for null or undefined, so the guard was never
    // reached. Removed in favour of the simpler two-step form below.
    const contractVersion = parseInt(String(data.contract_version), 10) || 1;
    // Use safeParseDateOrMin so that a missing/malformed computedAtUtc sorts
    // as oldest (epoch-zero) rather than newest (wall-clock), preventing a
    // bad event from masquerading as the latest snapshot.
    const computedAtUtc = safeParseDateOrMin(
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
    //
    // Guard against PostgreSQL's hard limit of 65535 parameters per query.
    // Each child-table row has at most 14 explicit user params (comparisons),
    // giving a safe ceiling of 4681 rows. Cap at MAX_BATCH_ROWS (module-scope
    // constant) to leave headroom. Log a warning when the cap fires so
    // operators can investigate abnormally large upstream events.
    const rawComparisonsAll = Array.isArray(data.comparisons) ? data.comparisons : [];
    if (rawComparisonsAll.length > MAX_BATCH_ROWS) {
      console.warn(
        `[ReadModelConsumer] baselines snapshot ${snapshotId} contains ` +
          `${rawComparisonsAll.length} comparison rows — capping at ${MAX_BATCH_ROWS} to avoid ` +
          `PostgreSQL parameter limit (65535). Excess rows will be dropped for this snapshot.`
      );
    }
    const rawComparisons = rawComparisonsAll.slice(0, MAX_BATCH_ROWS);

    const rawTrendAll = Array.isArray(data.trend) ? data.trend : [];
    if (rawTrendAll.length > MAX_BATCH_ROWS) {
      console.warn(
        `[ReadModelConsumer] baselines snapshot ${snapshotId} contains ` +
          `${rawTrendAll.length} trend rows — capping at ${MAX_BATCH_ROWS} to avoid ` +
          `PostgreSQL parameter limit (65535). Excess rows will be dropped for this snapshot.`
      );
    }
    const rawTrend = rawTrendAll.slice(0, MAX_BATCH_ROWS);

    const rawBreakdownAll = Array.isArray(data.breakdown) ? data.breakdown : [];
    if (rawBreakdownAll.length > MAX_BATCH_ROWS) {
      console.warn(
        `[ReadModelConsumer] baselines snapshot ${snapshotId} contains ` +
          `${rawBreakdownAll.length} breakdown rows — capping at ${MAX_BATCH_ROWS} to avoid ` +
          `PostgreSQL parameter limit (65535). Excess rows will be dropped for this snapshot.`
      );
    }
    const rawBreakdown = rawBreakdownAll.slice(0, MAX_BATCH_ROWS);

    // Build the filtered trend rows outside the transaction so the post-filter
    // count is accessible for the success log below (Issue 1 fix).
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
        date: String(t.date ?? t.dateStr),
        // NUMERIC(8,6) column: max 99.999999. Clamp to [0, 99] to prevent
        // PostgreSQL overflow if producer sends percentage-scale values (e.g. 12.5%).
        avgCostSavings: String(
          Math.min(Math.max(Number(t.avg_cost_savings ?? t.avgCostSavings ?? 0), 0), 99)
        ),
        avgOutcomeImprovement: String(
          Math.min(
            Math.max(Number(t.avg_outcome_improvement ?? t.avgOutcomeImprovement ?? 0), 0),
            99
          )
        ),
        comparisonsEvaluated: Number(t.comparisons_evaluated ?? t.comparisonsEvaluated ?? 0),
      }));

    // Deduplicate trend rows by date to prevent duplicate date inserts that would
    // inflate projection averages. Migration 0005 adds a UNIQUE(snapshot_id, date)
    // index as a DB-level guard; this dedup ensures duplicate-bearing payloads are
    // silently handled rather than raising a DB error.
    //
    // "Last wins" policy: the Map is iterated in insertion order, so each
    // occurrence of a duplicate date overwrites the previous one, keeping the
    // last row from the upstream payload. This is intentional — the upstream
    // producer emits trend rows ordered oldest-to-newest, so the last occurrence
    // of a given date represents the most recently computed value for that day.
    // If the producer's ordering guarantee is ever removed, "last wins" should
    // be revisited in favour of an explicit max-by-field selection.
    const trendRowsByDate = new Map<string, (typeof trendRows)[0]>();
    for (const row of trendRows) {
      trendRowsByDate.set(row.date, row);
    }
    const dedupedTrendRows = [...trendRowsByDate.values()];
    if (dedupedTrendRows.length < trendRows.length) {
      console.warn(
        `[read-model-consumer] Deduplicated ${trendRows.length - dedupedTrendRows.length} ` +
          `duplicate trend date(s) for snapshot ${snapshotId}`
      );
    }
    const finalTrendRows = dedupedTrendRows;
    if (rawTrend.length > 0 && finalTrendRows.length === 0) {
      console.warn(
        `[baselines] all ${rawTrend.length} trend rows filtered out for snapshot ${snapshotId} — check upstream data`
      );
    }

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

      let insertedComparisonCount = 0;
      let insertedBreakdownCount = 0;
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
          )
            .filter((c) => {
              const pid = String(c.pattern_id ?? c.patternId ?? '').trim();
              if (!pid) {
                console.warn(
                  `[read-model-consumer] Skipping comparison row with blank pattern_id for snapshot ${snapshotId}`
                );
                return false;
              }
              return true;
            })
            .map((c) => ({
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
              recommendation: (() => {
                const raw = String(c.recommendation ?? '');
                return VALID_PROMOTION_ACTIONS.has(raw) ? raw : 'shadow';
              })(),
              confidence: (() => {
                const raw = String(c.confidence ?? '').toLowerCase();
                return VALID_CONFIDENCE_LEVELS.has(raw) ? raw : 'low';
              })(),
              rationale: String(c.rationale ?? ''),
            }));
          if (comparisonRows.length === 0) {
            console.warn(
              `[baselines] all ${rawComparisons.length} comparison rows filtered out for snapshot ${snapshotId} — check upstream data`
            );
          } else {
            await tx.insert(baselinesComparisons).values(comparisonRows);
          }
          insertedComparisonCount = comparisonRows.length;
        }

        await tx.delete(baselinesTrend).where(eq(baselinesTrend.snapshotId, snapshotId));

        if (finalTrendRows.length > 0) {
          await tx.insert(baselinesTrend).values(finalTrendRows);
        }

        await tx.delete(baselinesBreakdown).where(eq(baselinesBreakdown.snapshotId, snapshotId));

        if (rawBreakdown.length > 0) {
          const breakdownRowsRaw: InsertBaselinesBreakdown[] = (
            rawBreakdown as Record<string, unknown>[]
          ).map((b) => {
            const rawAction = String(b.action ?? '');
            const action = VALID_PROMOTION_ACTIONS.has(rawAction) ? rawAction : 'shadow';
            return {
              snapshotId,
              action,
              count: Number(b.count ?? 0),
              // NUMERIC(5,4) column: max 9.9999. Clamp to [0, 1] since confidence
              // is a 0-1 ratio; guard against out-of-range producer values.
              avgConfidence: String(
                Math.min(Math.max(Number(b.avg_confidence ?? b.avgConfidence ?? 0), 0), 1)
              ),
            };
          });

          // Deduplicate breakdown rows by action (keep last occurrence) to prevent
          // duplicate action entries that would cause _deriveSummary() to double-count
          // promote_count/shadow_count/etc. A DB-level UNIQUE(snapshot_id, action)
          // index is added by migrations/0006_baselines_breakdown_unique.sql as a
          // backup guard; this app-level dedup remains as the primary defence so
          // the transaction never surfaces a constraint violation to callers.
          // (Analogous to the dedup applied to trend rows above, backed by 0005.)
          const breakdownByAction = new Map<string, (typeof breakdownRowsRaw)[0]>();
          for (const row of breakdownRowsRaw) {
            breakdownByAction.set(row.action, row);
          }
          const breakdownRows = [...breakdownByAction.values()];
          if (breakdownRows.length < breakdownRowsRaw.length) {
            console.warn(
              `[read-model-consumer] Deduplicated ${breakdownRowsRaw.length - breakdownRows.length} ` +
                `duplicate breakdown action(s) for snapshot ${snapshotId}`
            );
          }

          if (breakdownRows.length === 0) {
            console.warn(
              `[baselines] all ${rawBreakdown.length} breakdown rows filtered out for snapshot ${snapshotId} — check upstream data`
            );
          } else {
            await tx.insert(baselinesBreakdown).values(breakdownRows);
          }
          insertedBreakdownCount = breakdownRows.length;
        }
      });

      // Invalidate the baselines projection cache so the next API request
      // returns fresh data from the newly projected snapshot.
      // Wrapped defensively: a failure here must not block watermark advancement —
      // the DB writes have already committed successfully.
      try {
        baselinesProjection.reset();
      } catch (e) {
        console.warn('[read-model-consumer] baselinesProjection.reset() failed post-commit:', e);
      }

      // Notify WebSocket clients subscribed to the 'baselines' topic.
      // Called here (after transaction commits) so clients are only notified when
      // all DB writes have committed successfully.
      // Wrapped defensively: a failure here must not block watermark advancement.
      try {
        emitBaselinesUpdate(snapshotId);
      } catch (e) {
        console.warn('[read-model-consumer] emitBaselinesUpdate() failed post-commit:', e);
      }

      console.log(
        `[ReadModelConsumer] Projected baselines snapshot ${snapshotId} ` +
          `(${insertedComparisonCount} comparisons, ${finalTrendRows.length} trend points, ` +
          `${insertedBreakdownCount} breakdown rows)`
      );
    } catch (err) {
      // Degrade gracefully: if the table doesn't exist yet (migration not run),
      // advance the watermark so the consumer is not stuck retrying indefinitely.
      //
      // Primary check: PostgreSQL error code 42P01 ("undefined_table").
      // The pg / @neondatabase/serverless driver surfaces this as a `.code`
      // property on the thrown Error object.
      //
      // Fallback string check retained for defensive coverage in case the
      // driver wraps the error in a way that omits the code property.
      // Anchored to the primary table name so that 42703 "column does not exist"
      // errors from schema bugs are not silently swallowed as missing migrations.
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('baselines_snapshots') && msg.includes('does not exist'))
      ) {
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
