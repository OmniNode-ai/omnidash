/**
 * OmniMarket domain projection handlers (OMN-7920, OMN-8189).
 *
 * Projects events from omnimarket topics into the omnidash_analytics read-model:
 * - build-loop-orchestrator-phase-transition -> build_loop_orchestrator_events
 * - build-loop-orchestrator-completed -> build_loop_orchestrator_events
 * - session-post-mortem -> session_post_mortems (OMN-8189)
 *
 * Gaps (topics with no handler in this phase, noted per plan Task 5):
 *   onex.evt.omnimarket.delegation-attempt.v1 — no projection table yet
 *   onex.evt.omnimarket.delegation-metrics.v1 — no projection table yet
 *   All other omnimarket.* sweep/pipeline/release topics — no handler defined
 */

import { buildLoopOrchestratorEvents, sessionPostMortems } from '@shared/intelligence-schema';
import type {
  InsertBuildLoopOrchestratorEvent,
  InsertSessionPostMortem,
} from '@shared/intelligence-schema';
import {
  TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_PHASE_TRANSITION,
  TOPIC_OMNIMARKET_BUILD_LOOP_ORCHESTRATOR_COMPLETED,
  TOPIC_OMNIMARKET_SESSION_POST_MORTEM,
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
  TOPIC_OMNIMARKET_SESSION_POST_MORTEM,
]);

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

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

    if (topic === TOPIC_OMNIMARKET_SESSION_POST_MORTEM) {
      return this.projectSessionPostMortem(data, context);
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

      const occurredAt = safeParseDate(data['timestamp'] as string | undefined);

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

  private async projectSessionPostMortem(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    if (!context.db) return false;

    try {
      const sessionId = typeof data['session_id'] === 'string' ? data['session_id'] : null;
      if (!sessionId) {
        console.warn(
          '[OmnimarketProjectionHandler] session-post-mortem missing session_id, skipping'
        );
        return true;
      }

      const outcome = typeof data['outcome'] === 'string' ? data['outcome'] : 'failed';
      const VALID_OUTCOMES = new Set(['completed', 'partial', 'failed', 'aborted']);
      const safeOutcome = VALID_OUTCOMES.has(outcome) ? outcome : 'failed';

      const frictionEvents = Array.isArray(data['friction_events']) ? data['friction_events'] : [];

      const row: InsertSessionPostMortem = {
        sessionId,
        sessionLabel: typeof data['session_label'] === 'string' ? data['session_label'] : '',
        outcome: safeOutcome,
        phasesPlanned: toStringArray(data['phases_planned']),
        phasesCompleted: toStringArray(data['phases_completed']),
        phasesFailed: toStringArray(data['phases_failed']),
        phasesSkipped: toStringArray(data['phases_skipped']),
        stalledAgents: toStringArray(data['stalled_agents']),
        prsMerged: toStringArray(data['prs_merged']),
        prsOpen: toStringArray(data['prs_open']),
        prsFailed: toStringArray(data['prs_failed']),
        carryForwardItems: toStringArray(data['carry_forward_items']),
        frictionEventCount: frictionEvents.length,
        reportPath: typeof data['report_path'] === 'string' ? data['report_path'] : null,
        startedAt: safeParseDate(data['started_at'] as string | undefined),
        completedAt: safeParseDate(data['completed_at'] as string | undefined),
        emittedAt: safeParseDate(data['timestamp'] as string | undefined),
        rawPayload: data as Record<string, unknown>,
      };

      await context.db.insert(sessionPostMortems).values(row).onConflictDoNothing();

      this.stats.projected++;
      return true;
    } catch (err) {
      if (isTableMissingError(err, 'session_post_mortems')) {
        console.warn(
          '[OmnimarketProjectionHandler] session_post_mortems table missing — run migrations'
        );
        return false;
      }
      console.error('[OmnimarketProjectionHandler] Failed to project session post-mortem:', err);
      this.stats.dropped.missing_field++;
      return true;
    }
  }
}
