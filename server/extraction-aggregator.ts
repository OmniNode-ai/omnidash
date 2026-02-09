/**
 * Extraction Metrics Aggregator (OMN-1804)
 *
 * Isolated aggregator for pattern extraction pipeline events.
 * Keeps EventConsumer as a pure router — all extraction domain logic lives here.
 *
 * Responsibilities:
 * - Persist incoming Kafka events into 3 PostgreSQL tables
 * - Maintain lightweight in-memory counters for WebSocket invalidation
 *
 * Design:
 * - PostgreSQL is the single source of truth (API endpoints query DB directly)
 * - In-memory state is only used for WebSocket invalidation signals
 * - On server restart, in-memory counters reset to zero (DB is unaffected)
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

export class ExtractionMetricsAggregator {
  /** Lightweight counter for WebSocket invalidation decisions */
  private eventsSinceLastBroadcast = 0;
  private static readonly BROADCAST_THRESHOLD = 1;

  /**
   * Handle a context-utilization event.
   * Persists to injection_effectiveness table.
   */
  async handleContextUtilization(event: ContextUtilizationEvent): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping context-utilization event');
      return;
    }

    try {
      await db.insert(injectionEffectiveness).values({
        sessionId: event.session_id,
        cohort: event.cohort ?? null,
        utilizationScore: event.utilization_score?.toString() ?? null,
        agentMatchScore: event.agent_match_score?.toString() ?? null,
        userVisibleLatencyMs: event.user_visible_latency_ms ?? null,
        routingTimeMs: event.routing_time_ms ?? null,
        retrievalTimeMs: event.retrieval_time_ms ?? null,
        injectionTimeMs: event.injection_time_ms ?? null,
        outcome: event.outcome ?? 'success',
        stage: event.stage ?? null,
        metadata: event.metadata ?? {},
      });
      this.eventsSinceLastBroadcast++;
    } catch (error) {
      console.error('[extraction] Error persisting context-utilization event:', error);
    }
  }

  /**
   * Handle an agent-match event.
   * Persists to injection_effectiveness table with agent match specifics.
   */
  async handleAgentMatch(event: AgentMatchEvent): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping agent-match event');
      return;
    }

    try {
      await db.insert(injectionEffectiveness).values({
        sessionId: event.session_id,
        cohort: event.cohort ?? null,
        agentMatchScore: event.agent_match_score?.toString() ?? null,
        outcome: event.outcome ?? 'success',
        stage: event.stage ?? 'agent-match',
        metadata: event.metadata ?? {},
      });
      this.eventsSinceLastBroadcast++;
    } catch (error) {
      console.error('[extraction] Error persisting agent-match event:', error);
    }
  }

  /**
   * Handle a latency-breakdown event.
   * Persists to latency_breakdowns table.
   */
  async handleLatencyBreakdown(event: LatencyBreakdownEvent): Promise<void> {
    const db = tryGetIntelligenceDb();
    if (!db) {
      console.warn('[extraction] Database not available, dropping latency-breakdown event');
      return;
    }

    try {
      await db.insert(latencyBreakdowns).values({
        sessionId: event.session_id,
        promptId: event.prompt_id ?? null,
        routingTimeMs: event.routing_time_ms ?? null,
        retrievalTimeMs: event.retrieval_time_ms ?? null,
        injectionTimeMs: event.injection_time_ms ?? null,
        userVisibleLatencyMs: event.user_visible_latency_ms ?? null,
        cohort: event.cohort ?? null,
        metadata: event.metadata ?? {},
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
}
