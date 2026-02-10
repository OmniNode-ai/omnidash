/**
 * Extraction Metrics Aggregator (OMN-1804)
 *
 * Isolated aggregator for pattern extraction pipeline events.
 * Keeps EventConsumer as a pure router — all extraction domain logic lives here.
 *
 * Responsibilities:
 * - Persist incoming Kafka events into 3 PostgreSQL tables
 * - Maintain lightweight in-memory counters for WebSocket invalidation
 * - Enforce monotonic merge: older events cannot overwrite newer state
 *
 * Design:
 * - PostgreSQL is the single source of truth (API endpoints query DB directly)
 * - In-memory state is only used for WebSocket invalidation signals
 * - On server restart, in-memory counters reset to zero (DB is unaffected)
 * - Monotonic merge prevents stale replayed events from being persisted twice
 */

import { tryGetIntelligenceDb } from './storage';
import {
  injectionEffectiveness,
  latencyBreakdowns,
  patternHitRates,
} from '@shared/intelligence-schema';
import type {
  ContextUtilizationEvent,
  AgentMatchEvent,
  LatencyBreakdownEvent,
} from '@shared/extraction-types';
import { MonotonicMergeTracker, extractEventTimeMs } from './monotonic-merge';

export class ExtractionMetricsAggregator {
  /** Lightweight counter for WebSocket invalidation decisions */
  private eventsSinceLastBroadcast = 0;
  private static readonly BROADCAST_THRESHOLD = 1;

  /** Monotonic merge tracker for extraction event types */
  private monotonicMerge = new MonotonicMergeTracker();

  /**
   * Handle a context-utilization event.
   * Persists to injection_effectiveness table.
   *
   * @param event       - The parsed event payload
   * @param kafkaOffset - Kafka message offset used as seq for monotonic merge tie-breaking
   */
  async handleContextUtilization(event: ContextUtilizationEvent, kafkaOffset = 0): Promise<void> {
    // Monotonic merge gate: reject events older than the last applied
    const eventTime = extractEventTimeMs(event as unknown as Record<string, unknown>);
    if (
      !this.monotonicMerge.checkAndUpdate('context-utilization', { eventTime, seq: kafkaOffset })
    ) {
      return; // stale event — logged at debug level by the tracker
    }

    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping context-utilization event');
      return;
    }

    try {
      const createdAt = event.timestamp ? new Date(event.timestamp) : undefined;
      await db.insert(injectionEffectiveness).values({
        sessionId: event.session_id,
        correlationId: event.correlation_id,
        cohort: event.cohort,
        injectionOccurred: event.injection_occurred ?? false,
        agentName: event.agent_name ?? null,
        detectionMethod: event.detection_method ?? null,
        utilizationScore: event.utilization_score?.toString() ?? null,
        utilizationMethod: event.utilization_method ?? null,
        agentMatchScore: event.agent_match_score?.toString() ?? null,
        userVisibleLatencyMs: event.user_visible_latency_ms ?? null,
        sessionOutcome: event.session_outcome ?? null,
        routingTimeMs: event.routing_time_ms ?? null,
        retrievalTimeMs: event.retrieval_time_ms ?? null,
        injectionTimeMs: event.injection_time_ms ?? null,
        patternsCount: event.patterns_count ?? null,
        cacheHit: event.cache_hit ?? false,
        ...(createdAt && !isNaN(createdAt.getTime()) ? { createdAt } : {}),
      });
      this.eventsSinceLastBroadcast++;
    } catch (error) {
      console.error('[extraction] Error persisting context-utilization event:', error);
    }
  }

  /**
   * Handle an agent-match event.
   * Persists to injection_effectiveness table with agent match specifics.
   *
   * @param event       - The parsed event payload
   * @param kafkaOffset - Kafka message offset used as seq for monotonic merge tie-breaking
   */
  async handleAgentMatch(event: AgentMatchEvent, kafkaOffset = 0): Promise<void> {
    // Monotonic merge gate: reject events older than the last applied
    const eventTime = extractEventTimeMs(event as unknown as Record<string, unknown>);
    if (!this.monotonicMerge.checkAndUpdate('agent-match', { eventTime, seq: kafkaOffset })) {
      return; // stale event — logged at debug level by the tracker
    }

    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping agent-match event');
      return;
    }

    try {
      const createdAt = event.timestamp ? new Date(event.timestamp) : undefined;
      await db.insert(injectionEffectiveness).values({
        sessionId: event.session_id,
        correlationId: event.correlation_id,
        cohort: event.cohort,
        injectionOccurred: event.injection_occurred ?? false,
        agentName: event.agent_name ?? null,
        agentMatchScore: event.agent_match_score?.toString() ?? null,
        sessionOutcome: event.session_outcome ?? null,
        ...(createdAt && !isNaN(createdAt.getTime()) ? { createdAt } : {}),
      });
      this.eventsSinceLastBroadcast++;
    } catch (error) {
      console.error('[extraction] Error persisting agent-match event:', error);
    }
  }

  /**
   * Handle a latency-breakdown event.
   * Persists to latency_breakdowns table.
   *
   * @param event       - The parsed event payload
   * @param kafkaOffset - Kafka message offset used as seq for monotonic merge tie-breaking
   */
  async handleLatencyBreakdown(event: LatencyBreakdownEvent, kafkaOffset = 0): Promise<void> {
    // Monotonic merge gate: reject events older than the last applied
    const eventTime = extractEventTimeMs(event as unknown as Record<string, unknown>);
    if (!this.monotonicMerge.checkAndUpdate('latency-breakdown', { eventTime, seq: kafkaOffset })) {
      return; // stale event — logged at debug level by the tracker
    }

    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping latency-breakdown event');
      return;
    }

    try {
      const createdAt = event.timestamp ? new Date(event.timestamp) : undefined;
      await db.insert(latencyBreakdowns).values({
        sessionId: event.session_id,
        promptId: event.prompt_id,
        cohort: event.cohort,
        routingTimeMs: event.routing_time_ms ?? null,
        retrievalTimeMs: event.retrieval_time_ms ?? null,
        injectionTimeMs: event.injection_time_ms ?? null,
        userVisibleLatencyMs: event.user_visible_latency_ms ?? null,
        cacheHit: event.cache_hit ?? false,
        ...(createdAt && !isNaN(createdAt.getTime()) ? { createdAt } : {}),
      });
      this.eventsSinceLastBroadcast++;
    } catch (error) {
      console.error('[extraction] Error persisting latency-breakdown event:', error);
    }
  }

  /**
   * Check if there are pending events that should trigger a WebSocket broadcast.
   * Resets the counter after check.
   */
  shouldBroadcast(): boolean {
    if (this.eventsSinceLastBroadcast >= ExtractionMetricsAggregator.BROADCAST_THRESHOLD) {
      this.eventsSinceLastBroadcast = 0;
      return true;
    }
    return false;
  }

  /** Number of stale events rejected by the monotonic merge tracker. */
  get rejectedCount(): number {
    return this.monotonicMerge.rejectedCount;
  }

  /** Reset the monotonic merge tracker (e.g. for demo mode). */
  resetMergeTracker(): void {
    this.monotonicMerge.reset();
  }
}
