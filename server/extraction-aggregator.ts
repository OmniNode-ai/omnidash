/**
 * Extraction Metrics Aggregator (OMN-1804)
 *
 * Isolated aggregator for pattern extraction pipeline events.
 * Keeps EventConsumer as a pure router — all extraction domain logic lives here.
 *
 * Responsibilities:
 * - Persist incoming Kafka events into 3 PostgreSQL tables
 * - Maintain lightweight in-memory counters for WebSocket invalidation
 * - Idempotent writes via ON CONFLICT DO NOTHING (prevents duplicate rows)
 *
 * Design:
 * - PostgreSQL is the single source of truth (API endpoints query DB directly)
 * - In-memory state is only used for WebSocket invalidation signals
 * - On server restart, in-memory counters reset to zero (DB is unaffected)
 * - Monotonic merge (preventing stale replayed events from overwriting newer
 *   state) is enforced upstream by MonotonicMergeTracker in EventConsumer,
 *   NOT by this class. This class relies on PostgreSQL unique constraints
 *   for idempotency only.
 *
 * Timestamp handling:
 * - Every persisted row MUST have an explicit `createdAt` value — we never
 *   rely on PostgreSQL's `DEFAULT now()` because that assigns processing time,
 *   not event time. Late-arriving or replayed events would land in the wrong
 *   time bucket for `date_trunc()`-based dashboard queries.
 * - Fallback chain: event.timestamp -> kafkaTimestamp -> Date.now() (with warning).
 * - When only Date.now() is available, a warning is logged so operators can
 *   investigate missing timestamps at the producer level.
 */

import { tryGetIntelligenceDb } from './storage';
import { injectionEffectiveness, latencyBreakdowns } from '@shared/intelligence-schema';
import type {
  ContextUtilizationEvent,
  AgentMatchEvent,
  LatencyBreakdownEvent,
} from '@shared/extraction-types';

/**
 * Resolve the authoritative event timestamp for DB persistence.
 *
 * Fallback chain (first valid value wins):
 *   1. event.timestamp  — producer-assigned event time (best)
 *   2. kafkaTimestamp    — broker-assigned CreateTime from the Kafka message header
 *   3. Date.now()        — last resort; logs a warning so operators can investigate
 *
 * Returns a valid Date that is always set (never undefined), ensuring the
 * `createdAt` column is explicitly populated and not left to PostgreSQL's
 * `DEFAULT now()`. This prevents time-bucket skew in `date_trunc()` queries
 * when events arrive late or are replayed.
 */
function resolveEventTimestamp(
  eventTimestamp: string | undefined,
  kafkaTimestamp: string | undefined,
  label: string
): Date {
  // 1. Prefer the event payload's own timestamp
  if (eventTimestamp) {
    const d = new Date(eventTimestamp);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Fall back to the Kafka message-level timestamp (broker CreateTime)
  if (kafkaTimestamp) {
    // KafkaJS provides message.timestamp as a string of epoch milliseconds
    const ms = Number(kafkaTimestamp);
    if (!isNaN(ms) && ms > 0) return new Date(ms);
    // Also handle ISO string format
    const d = new Date(kafkaTimestamp);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Last resort: processing time. This may cause time-bucket skew for
  //    late-arriving events, so warn operators to fix the producer.
  console.warn(
    `[extraction] ${label}: no valid event or Kafka timestamp found, ` +
      `falling back to processing time (Date.now()). ` +
      `This may skew time-bucketed dashboard queries.`
  );
  return new Date();
}

export class ExtractionMetricsAggregator {
  /** Lightweight counter for WebSocket invalidation decisions */
  private eventsSinceLastBroadcast = 0;
  /**
   * Broadcast after every single event for real-time dashboard updates.
   * Increase this value to batch WebSocket invalidation signals under high
   * event throughput (e.g., set to 10 to broadcast every 10th event).
   */
  private static readonly BROADCAST_THRESHOLD = 1;

  /**
   * Handle a context-utilization event.
   * Persists to injection_effectiveness table.
   *
   * @param event - The parsed event payload
   * @param kafkaTimestamp - Optional Kafka message timestamp (broker CreateTime).
   *   Used as fallback when event.timestamp is missing, to avoid falling back
   *   to processing time which would skew time-bucketed dashboard queries.
   */
  async handleContextUtilization(
    event: ContextUtilizationEvent,
    kafkaTimestamp?: string
  ): Promise<void> {
    // Idempotency: ON CONFLICT DO NOTHING on the unique index
    // (session_id, correlation_id, event_type) prevents duplicate rows
    // from Kafka consumer rebalancing replays. Each (session, correlation,
    // event_type) triple is inserted at most once; repeated deliveries
    // are silently dropped by PostgreSQL.
    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping context-utilization event');
      return;
    }

    try {
      // Always persist an explicit timestamp — never rely on DB DEFAULT now().
      // See module-level doc for the fallback chain rationale.
      const createdAt = resolveEventTimestamp(
        event.timestamp,
        kafkaTimestamp,
        'context-utilization'
      );
      const inserted = await db
        .insert(injectionEffectiveness)
        .values({
          sessionId: event.session_id,
          correlationId: event.correlation_id,
          cohort: event.cohort,
          injectionOccurred: event.injection_occurred ?? false,
          agentName: event.agent_name ?? null,
          detectionMethod: event.detection_method ?? null,
          utilizationScore:
            event.utilization_score != null ? String(event.utilization_score) : null,
          utilizationMethod: event.utilization_method ?? null,
          agentMatchScore: event.agent_match_score != null ? String(event.agent_match_score) : null,
          userVisibleLatencyMs: event.user_visible_latency_ms ?? null,
          sessionOutcome: event.session_outcome ?? null,
          routingTimeMs: event.routing_time_ms ?? null,
          retrievalTimeMs: event.retrieval_time_ms ?? null,
          injectionTimeMs: event.injection_time_ms ?? null,
          patternsCount: event.patterns_count ?? null,
          cacheHit: event.cache_hit ?? false,
          eventType: 'context_utilization',
          createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: injectionEffectiveness.id });
      if (inserted.length > 0) {
        this.eventsSinceLastBroadcast++;
      }
    } catch (error) {
      console.error('[extraction] Error persisting context-utilization event:', error);
    }
  }

  /**
   * Handle an agent-match event.
   * Persists to injection_effectiveness table with agent match specifics.
   *
   * @param event - The parsed event payload
   * @param kafkaTimestamp - Optional Kafka message timestamp (broker CreateTime).
   *   Used as fallback when event.timestamp is missing.
   */
  async handleAgentMatch(event: AgentMatchEvent, kafkaTimestamp?: string): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping agent-match event');
      return;
    }

    try {
      // Always persist an explicit timestamp — never rely on DB DEFAULT now().
      const createdAt = resolveEventTimestamp(event.timestamp, kafkaTimestamp, 'agent-match');
      const inserted = await db
        .insert(injectionEffectiveness)
        .values({
          sessionId: event.session_id,
          correlationId: event.correlation_id,
          cohort: event.cohort,
          injectionOccurred: event.injection_occurred ?? false,
          agentName: event.agent_name ?? null,
          agentMatchScore: event.agent_match_score?.toString() ?? null,
          sessionOutcome: event.session_outcome ?? null,
          eventType: 'agent_match',
          createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: injectionEffectiveness.id });
      if (inserted.length > 0) {
        this.eventsSinceLastBroadcast++;
      }
    } catch (error) {
      console.error('[extraction] Error persisting agent-match event:', error);
    }
  }

  /**
   * Handle a latency-breakdown event.
   * Persists to latency_breakdowns table.
   *
   * @param event - The parsed event payload
   * @param kafkaTimestamp - Optional Kafka message timestamp (broker CreateTime).
   *   Used as fallback when event.timestamp is missing.
   */
  async handleLatencyBreakdown(
    event: LatencyBreakdownEvent,
    kafkaTimestamp?: string
  ): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping latency-breakdown event');
      return;
    }

    try {
      // Always persist an explicit timestamp — never rely on DB DEFAULT now().
      const createdAt = resolveEventTimestamp(event.timestamp, kafkaTimestamp, 'latency-breakdown');
      const inserted = await db
        .insert(latencyBreakdowns)
        .values({
          sessionId: event.session_id,
          promptId: event.prompt_id,
          cohort: event.cohort,
          routingTimeMs: event.routing_time_ms ?? null,
          retrievalTimeMs: event.retrieval_time_ms ?? null,
          injectionTimeMs: event.injection_time_ms ?? null,
          userVisibleLatencyMs: event.user_visible_latency_ms ?? null,
          cacheHit: event.cache_hit ?? false,
          createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: latencyBreakdowns.id });
      if (inserted.length > 0) {
        this.eventsSinceLastBroadcast++;
      }
    } catch (error) {
      console.error('[extraction] Error persisting latency-breakdown event:', error);
    }
  }

  /**
   * Check if there are pending events that should trigger a WebSocket broadcast.
   * Resets the counter after check. The counter only increments when a row is
   * actually inserted (via `.returning()`), so duplicate events suppressed by
   * onConflictDoNothing do not produce false-positive broadcasts.
   *
   * Thread safety: Node.js is single-threaded. Although the async handler
   * methods yield at `await db.insert(...)`, the `counter++` and this
   * check-and-reset are synchronous operations within the same microtask,
   * so they cannot interleave with another handler's check-and-reset.
   */
  shouldBroadcast(): boolean {
    if (this.eventsSinceLastBroadcast >= ExtractionMetricsAggregator.BROADCAST_THRESHOLD) {
      this.eventsSinceLastBroadcast = 0;
      return true;
    }
    return false;
  }
}
