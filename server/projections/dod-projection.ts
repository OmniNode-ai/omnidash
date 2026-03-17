/**
 * DodProjection — DB-backed projection for DoD verification data (OMN-5200)
 *
 * Projects from: dod_verify_runs + dod_guard_events tables (created by OMN-5199)
 *
 * Snapshot payload shape:
 *   { stats: DodStats; verify_runs: DodVerifyRunRow[]; guard_events: DodGuardEventRow[]; trends: DodTrendPoint[] }
 *
 * Routes access this via dodProjection.ensureFresh() — no direct DB imports
 * allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import {
  dodVerifyRunRowSchema,
  dodGuardEventRowSchema,
  dodStatsSchema,
  dodTrendPointSchema,
  dodPayloadSchema,
  type DodPayload,
} from '@shared/omniclaude-state-schema';

// Re-export for client imports
export type { DodPayload };

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class DodProjection extends DbBackedProjectionView<DodPayload> {
  readonly viewId = 'dod-verification';

  protected emptyPayload(): DodPayload {
    return {
      stats: { total_runs: 0, pass_rate_7d: 0, guard_blocks_7d: 0, tickets_with_evidence: 0 },
      verify_runs: [],
      guard_events: [],
      trends: [],
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<DodPayload> {
    try {
      const [verifyRows, guardRows, statsRows, trendRows] = await Promise.all([
        // Recent verification runs
        db.execute(sql`
          SELECT
            id,
            ticket_id,
            status,
            checks_passed,
            checks_total,
            policy_mode,
            evidence_items,
            event_timestamp::text
          FROM dod_verify_runs
          ORDER BY event_timestamp DESC
          LIMIT ${limit}
        `),

        // Recent guard events
        db.execute(sql`
          SELECT
            id,
            ticket_id,
            guard_outcome,
            policy_mode,
            receipt_age_hours,
            event_timestamp::text
          FROM dod_guard_events
          ORDER BY event_timestamp DESC
          LIMIT ${limit}
        `),

        // Summary stats
        db.execute(sql`
          SELECT
            (SELECT COUNT(*)::int FROM dod_verify_runs) AS total_runs,
            COALESCE(
              (SELECT COUNT(*) FILTER (WHERE status = 'pass')::float
               / NULLIF(COUNT(*)::float, 0)
               FROM dod_verify_runs
               WHERE event_timestamp >= NOW() - INTERVAL '7 days'),
              0
            ) AS pass_rate_7d,
            (SELECT COUNT(*)::int FROM dod_guard_events
             WHERE guard_outcome = 'blocked'
             AND event_timestamp >= NOW() - INTERVAL '7 days') AS guard_blocks_7d,
            (SELECT COUNT(DISTINCT ticket_id)::int FROM dod_verify_runs) AS tickets_with_evidence
        `),

        // Daily pass-rate trend (last 30 days)
        db.execute(sql`
          SELECT
            d::date::text AS date,
            COALESCE(
              COUNT(*) FILTER (WHERE v.status = 'pass')::float
              / NULLIF(COUNT(v.id)::float, 0),
              0
            ) AS pass_rate,
            COUNT(v.id)::int AS total
          FROM generate_series(
            CURRENT_DATE - INTERVAL '29 days',
            CURRENT_DATE,
            '1 day'
          ) AS d
          LEFT JOIN dod_verify_runs v
            ON v.event_timestamp::date = d::date
          GROUP BY d
          ORDER BY d
        `),
      ]);

      const rawStats = ((statsRows.rows ?? []) as unknown[])[0] as
        | Record<string, unknown>
        | undefined;
      const stats = dodStatsSchema.parse({
        total_runs: Number(rawStats?.total_runs ?? 0),
        pass_rate_7d: Number(rawStats?.pass_rate_7d ?? 0),
        guard_blocks_7d: Number(rawStats?.guard_blocks_7d ?? 0),
        tickets_with_evidence: Number(rawStats?.tickets_with_evidence ?? 0),
      });

      const verify_runs = (verifyRows.rows ?? []).map((row) => dodVerifyRunRowSchema.parse(row));
      const guard_events = (guardRows.rows ?? []).map((row) => dodGuardEventRowSchema.parse(row));
      const trends = (trendRows.rows ?? []).map((row) =>
        dodTrendPointSchema.parse({
          date: (row as Record<string, unknown>).date,
          pass_rate: Number((row as Record<string, unknown>).pass_rate ?? 0),
          total: Number((row as Record<string, unknown>).total ?? 0),
        })
      );

      return dodPayloadSchema.parse({ stats, verify_runs, guard_events, trends });
    } catch (err) {
      // Graceful degrade: tables may not exist yet (OMN-5199 migration pending)
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('dod_verify_runs') && msg.includes('does not exist')) ||
        (msg.includes('dod_guard_events') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
