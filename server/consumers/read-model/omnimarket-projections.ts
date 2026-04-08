/**
 * OmniMarket domain projection handlers (OMN-7920).
 *
 * Projects events from omnimarket topics into the omnidash_analytics read-model:
 * - build-loop-orchestrator-phase-transition -> build_loop_orchestrator_events
 * - build-loop-orchestrator-completed -> build_loop_orchestrator_events
 *
 * Gaps (topics with no handler in this phase, noted per plan Task 5):
 *   onex.evt.omnimarket.delegation-attempt.v1 — no projection table yet
 *   onex.evt.omnimarket.delegation-metrics.v1 — no projection table yet
 *   All other omnimarket.* sweep/pipeline/release topics — no handler defined
 */

import { buildLoopOrchestratorEvents } from '@shared/intelligence-schema';
import type { InsertBuildLoopOrchestratorEvent } from '@shared/intelligence-schema';
import {
  TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_PHASE_TRANSITION,
  TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_COMPLETED,
} from '@shared/topics';

import type {
  ProjectionHandler,
  ProjectionContext,
  MessageMeta,
  ProjectionHandlerStats,
} from './types';
import {
  safeParseDate,
  isTableMissingError,
  createHandlerStats,
  registerHandlerStats,
} from './types';

const OMNIMARKET_TOPICS = new Set([
  TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_PHASE_TRANSITION,
  TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_COMPLETED,
]);

export class OmnimarketProjectionHandler implements ProjectionHandler {
  readonly stats: ProjectionHandlerStats = createHandlerStats();

  constructor() {
    registerHandlerStats('OmnimarketProjectionHandler', this.stats);
  }

  canHandle(topic: string): boolean {
    return OMNIMARKET_TOPICS.has(topic);
  }

  async projectEvent(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext,
    _meta: MessageMeta
  ): Promise<boolean> {
    if (!context.db) return false;

    if (
      topic === TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_PHASE_TRANSITION ||
      topic === TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_COMPLETED
    ) {
      return this.projectBuildLoopOrchestratorEvent(topic, data, context);
    }

    return true;
  }

  private async projectBuildLoopOrchestratorEvent(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    if (!context.db) return false;

    try {
      const eventType =
        topic === TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_PHASE_TRANSITION
          ? 'phase_transition'
          : 'completed';

      const correlationId =
        typeof data['correlation_id'] === 'string' ? data['correlation_id'] : null;
      if (!correlationId) {
        console.warn('[OmnimarketProjectionHandler] Missing correlation_id, skipping');
        return true;
      }

      const occurredAt = safeParseDate(data['timestamp'] as string | undefined) ?? new Date();

      const row: InsertBuildLoopOrchestratorEvent = {
        correlationId,
        eventType,
        phase: typeof data['phase'] === 'string' ? data['phase'] : null,
        previousPhase: typeof data['previous_phase'] === 'string' ? data['previous_phase'] : null,
        cyclesCompleted:
          typeof data['cycles_completed'] === 'number' ? data['cycles_completed'] : null,
        cyclesFailed: typeof data['cycles_failed'] === 'number' ? data['cycles_failed'] : null,
        totalTicketsDispatched:
          typeof data['total_tickets_dispatched'] === 'number'
            ? data['total_tickets_dispatched']
            : null,
        status: typeof data['status'] === 'string' ? data['status'] : null,
        occurredAt,
        rawPayload: data as Record<string, unknown>,
      };

      await context.db.insert(buildLoopOrchestratorEvents).values(row).onConflictDoNothing();

      this.stats.projected++;
      return true;
    } catch (err) {
      if (isTableMissingError(err, 'build_loop_orchestrator_events')) {
        console.warn(
          '[OmnimarketProjectionHandler] build_loop_orchestrator_events table missing — run migrations'
        );
        return false;
      }
      console.error('[OmnimarketProjectionHandler] Failed to project build loop event:', err);
      this.stats.dropped.missing_field++;
      return true;
    }
  }
}
