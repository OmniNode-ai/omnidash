/**
 * ONEX Change Control domain projection handlers (OMN-5291).
 *
 * Projects events from onex-change-control topics into the omnidash_analytics read-model:
 * - governance-check-completed.v1 -> governance_checks (idempotent ON CONFLICT DO NOTHING on event_id)
 * - drift-detected.v1             -> governance_drifts (idempotent ON CONFLICT DO NOTHING on event_id)
 * - cosmetic-compliance-scored.v1 -> governance_cosmetic_scores (idempotent ON CONFLICT DO NOTHING on event_id)
 */

import {
  governanceChecks,
  governanceDrifts,
  governanceCosmeticScores,
} from '@shared/intelligence-schema';
import {
  TOPIC_GOVERNANCE_CHECK_COMPLETED,
  TOPIC_DRIFT_DETECTED,
  TOPIC_COSMETIC_COMPLIANCE_SCORED,
} from '@shared/topics';

import type { ProjectionHandler, ProjectionContext, MessageMeta } from './types';
import { safeParseDate, isTableMissingError } from './types';

const GOVERNANCE_TOPICS = new Set([
  TOPIC_GOVERNANCE_CHECK_COMPLETED,
  TOPIC_DRIFT_DETECTED,
  TOPIC_COSMETIC_COMPLIANCE_SCORED,
]);

export class OnexChangeControlProjectionHandler implements ProjectionHandler {
  canHandle(topic: string): boolean {
    return GOVERNANCE_TOPICS.has(topic);
  }

  async projectEvent(
    topic: string,
    data: Record<string, unknown>,
    context: ProjectionContext,
    _meta: MessageMeta
  ): Promise<boolean> {
    switch (topic) {
      case TOPIC_GOVERNANCE_CHECK_COMPLETED:
        return this.projectGovernanceCheckCompleted(data, context);
      case TOPIC_DRIFT_DETECTED:
        return this.projectDriftDetected(data, context);
      case TOPIC_COSMETIC_COMPLIANCE_SCORED:
        return this.projectCosmeticComplianceScored(data, context);
      default:
        return true;
    }
  }

  // -------------------------------------------------------------------------
  // governance-check-completed -> governance_checks (OMN-5291)
  // -------------------------------------------------------------------------

  private async projectGovernanceCheckCompleted(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    const { db } = context;
    if (!db) return false;

    const payload = (data.payload as Record<string, unknown>) ?? data;
    const eventId = (data.event_id as string) ?? (data.eventId as string);
    if (!eventId) {
      console.warn('[ReadModelConsumer] governance-check-completed missing event_id -- skipping');
      return true;
    }

    const checkType = (payload.check_type as string) ?? (payload.checkType as string) ?? 'unknown';
    const target = (payload.target as string) ?? '';
    const passed = Boolean(payload.passed ?? false);
    const violationCount = Number(payload.violation_count ?? payload.violationCount ?? 0);
    const details = (payload.details as object | null) ?? null;
    const eventTimestamp = safeParseDate(
      data.timestamp ?? data.event_timestamp ?? data.created_at ?? new Date()
    );

    try {
      await db
        .insert(governanceChecks)
        .values({
          eventId,
          checkType,
          target,
          passed,
          violationCount,
          details,
          createdAt: eventTimestamp,
          projectedAt: new Date(),
        })
        .onConflictDoNothing();

      return true;
    } catch (err) {
      if (isTableMissingError(err, 'governance_checks')) {
        console.warn(
          '[ReadModelConsumer] governance_checks table not yet created -- ' +
            'run migrations to enable governance check projection'
        );
        return true;
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // drift-detected -> governance_drifts (OMN-5291)
  // -------------------------------------------------------------------------

  private async projectDriftDetected(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    const { db } = context;
    if (!db) return false;

    const payload = (data.payload as Record<string, unknown>) ?? data;
    const eventId = (data.event_id as string) ?? (data.eventId as string);
    if (!eventId) {
      console.warn('[ReadModelConsumer] drift-detected missing event_id -- skipping');
      return true;
    }

    const ticketId = (payload.ticket_id as string) ?? (payload.ticketId as string) ?? '';
    const driftKind = (payload.drift_kind as string) ?? (payload.driftKind as string) ?? 'unknown';
    const description = (payload.description as string) ?? '';
    const severity = (payload.severity as string) ?? 'warning';
    const eventTimestamp = safeParseDate(
      data.timestamp ?? data.event_timestamp ?? data.created_at ?? new Date()
    );

    try {
      await db
        .insert(governanceDrifts)
        .values({
          eventId,
          ticketId,
          driftKind,
          description,
          severity,
          createdAt: eventTimestamp,
          projectedAt: new Date(),
        })
        .onConflictDoNothing();

      return true;
    } catch (err) {
      if (isTableMissingError(err, 'governance_drifts')) {
        console.warn(
          '[ReadModelConsumer] governance_drifts table not yet created -- ' +
            'run migrations to enable drift detection projection'
        );
        return true;
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // cosmetic-compliance-scored -> governance_cosmetic_scores (OMN-5291)
  // -------------------------------------------------------------------------

  private async projectCosmeticComplianceScored(
    data: Record<string, unknown>,
    context: ProjectionContext
  ): Promise<boolean> {
    const { db } = context;
    if (!db) return false;

    const payload = (data.payload as Record<string, unknown>) ?? data;
    const eventId = (data.event_id as string) ?? (data.eventId as string);
    if (!eventId) {
      console.warn('[ReadModelConsumer] cosmetic-compliance-scored missing event_id -- skipping');
      return true;
    }

    const target = (payload.target as string) ?? '';
    const score = Number(payload.score ?? 0);
    const totalChecks = Number(payload.total_checks ?? payload.totalChecks ?? 0);
    const passedChecks = Number(payload.passed_checks ?? payload.passedChecks ?? 0);
    const failedChecks = Number(payload.failed_checks ?? payload.failedChecks ?? 0);
    const violations = (payload.violations as object[] | null) ?? null;
    const eventTimestamp = safeParseDate(
      data.timestamp ?? data.event_timestamp ?? data.created_at ?? new Date()
    );

    try {
      await db
        .insert(governanceCosmeticScores)
        .values({
          eventId,
          target,
          score,
          totalChecks,
          passedChecks,
          failedChecks,
          violations,
          createdAt: eventTimestamp,
          projectedAt: new Date(),
        })
        .onConflictDoNothing();

      return true;
    } catch (err) {
      if (isTableMissingError(err, 'governance_cosmetic_scores')) {
        console.warn(
          '[ReadModelConsumer] governance_cosmetic_scores table not yet created -- ' +
            'run migrations to enable cosmetic compliance projection'
        );
        return true;
      }
      throw err;
    }
  }
}
