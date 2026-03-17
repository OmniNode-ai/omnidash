/**
 * GovernanceProjection — DB-backed projection for onex-change-control events (OMN-5291)
 *
 * Projects from three topics:
 *   onex.evt.onex-change-control.governance-check-completed.v1  → governance_checks
 *   onex.evt.onex-change-control.drift-detected.v1             → governance_drifts
 *   onex.evt.onex-change-control.cosmetic-compliance-scored.v1 → governance_cosmetic_scores
 *
 * Snapshot payload shape:
 *   { summary: GovernanceSummary; recent_checks: ...; recent_drifts: ...; recent_cosmetic: ... }
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import {
  governanceCheckRowSchema,
  governanceDriftRowSchema,
  governanceCosmeticRowSchema,
  governanceSummarySchema,
  governancePayloadSchema,
  type GovernancePayload,
} from '@shared/governance-types';

export type { GovernancePayload };

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

const TABLE_NOT_EXISTS = '42P01';

function isTableMissingError(err: unknown, tableName: string): boolean {
  const pgCode = (err as { code?: string }).code;
  const msg = err instanceof Error ? err.message : String(err);
  return pgCode === TABLE_NOT_EXISTS || (msg.includes(tableName) && msg.includes('does not exist'));
}

export class GovernanceProjection extends DbBackedProjectionView<GovernancePayload> {
  readonly viewId = 'governance';

  protected emptyPayload(): GovernancePayload {
    return {
      summary: {
        total_checks_7d: 0,
        passed_checks_7d: 0,
        failed_checks_7d: 0,
        drift_events_7d: 0,
        avg_cosmetic_score: 0,
      },
      recent_checks: [],
      recent_drifts: [],
      recent_cosmetic: [],
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<GovernancePayload> {
    try {
      const [checksRows, driftsRows, cosmeticRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            id::text,
            check_type,
            target,
            passed,
            violation_count,
            details,
            created_at::text
          FROM governance_checks
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            id::text,
            ticket_id,
            drift_kind,
            description,
            severity,
            created_at::text
          FROM governance_drifts
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            id::text,
            target,
            score,
            total_checks,
            passed_checks,
            failed_checks,
            created_at::text
          FROM governance_cosmetic_scores
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM governance_checks WHERE created_at >= NOW() - INTERVAL '7 days') AS total_checks_7d,
            (SELECT COUNT(*)::int FROM governance_checks WHERE created_at >= NOW() - INTERVAL '7 days' AND passed = true) AS passed_checks_7d,
            (SELECT COUNT(*)::int FROM governance_checks WHERE created_at >= NOW() - INTERVAL '7 days' AND passed = false) AS failed_checks_7d,
            (SELECT COUNT(*)::int FROM governance_drifts WHERE created_at >= NOW() - INTERVAL '7 days') AS drift_events_7d,
            (SELECT COALESCE(AVG(score), 0)::float FROM governance_cosmetic_scores WHERE created_at >= NOW() - INTERVAL '7 days') AS avg_cosmetic_score
        `),
      ]);

      const rawSummary = ((summaryRows.rows ?? []) as unknown[])[0] ?? {};
      const s = rawSummary as Record<string, unknown>;

      const summary = governanceSummarySchema.parse({
        total_checks_7d: Number(s.total_checks_7d ?? 0),
        passed_checks_7d: Number(s.passed_checks_7d ?? 0),
        failed_checks_7d: Number(s.failed_checks_7d ?? 0),
        drift_events_7d: Number(s.drift_events_7d ?? 0),
        avg_cosmetic_score: Number(s.avg_cosmetic_score ?? 0),
      });

      const recent_checks = (checksRows.rows ?? []).map((row) =>
        governanceCheckRowSchema.parse(row)
      );
      const recent_drifts = (driftsRows.rows ?? []).map((row) =>
        governanceDriftRowSchema.parse(row)
      );
      const recent_cosmetic = (cosmeticRows.rows ?? []).map((row) =>
        governanceCosmeticRowSchema.parse(row)
      );

      return governancePayloadSchema.parse({ summary, recent_checks, recent_drifts, recent_cosmetic });
    } catch (err) {
      if (
        isTableMissingError(err, 'governance_checks') ||
        isTableMissingError(err, 'governance_drifts') ||
        isTableMissingError(err, 'governance_cosmetic_scores')
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
