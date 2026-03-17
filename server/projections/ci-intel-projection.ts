/**
 * CiIntelProjection — DB-backed projection for CI debug escalation events (OMN-5282)
 *
 * Projects from: onex.evt.omniintelligence.ci-debug-escalation.v1
 * Source table:  ci_debug_escalation_events (populated by read-model-consumer.ts)
 *
 * Snapshot payload shape:
 *   { recent: CiDebugEscalationRow[]; summary: CiDebugEscalationSummary }
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import { z } from 'zod';

// ============================================================================
// Schema
// ============================================================================

const ciDebugEscalationRowSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  node_id: z.string(),
  error_type: z.string(),
  escalation_level: z.string(),
  resolution: z.string().nullable(),
  event_timestamp: z.string(),
  ingested_at: z.string(),
});

const ciDebugEscalationSummarySchema = z.object({
  total_events: z.number(),
  affected_runs: z.number(),
  unresolved_count: z.number(),
  top_error_type: z.string().nullable(),
});

const ciDebugEscalationPayloadSchema = z.object({
  recent: z.array(ciDebugEscalationRowSchema),
  summary: ciDebugEscalationSummarySchema,
});

export type CiDebugEscalationRow = z.infer<typeof ciDebugEscalationRowSchema>;
export type CiDebugEscalationSummary = z.infer<typeof ciDebugEscalationSummarySchema>;
export type CiDebugEscalationPayload = z.infer<typeof ciDebugEscalationPayloadSchema>;

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class CiIntelProjection extends DbBackedProjectionView<CiDebugEscalationPayload> {
  readonly viewId = 'ci-intel';

  protected emptyPayload(): CiDebugEscalationPayload {
    return {
      recent: [],
      summary: {
        total_events: 0,
        affected_runs: 0,
        unresolved_count: 0,
        top_error_type: null,
      },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<CiDebugEscalationPayload> {
    try {
      const [recentRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            id::text,
            run_id,
            node_id,
            error_type,
            escalation_level,
            resolution,
            event_timestamp::text,
            ingested_at::text
          FROM ci_debug_escalation_events
          ORDER BY event_timestamp DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_events,
            COUNT(DISTINCT run_id)::int AS affected_runs,
            COUNT(*) FILTER (WHERE resolution IS NULL)::int AS unresolved_count,
            MODE() WITHIN GROUP (ORDER BY error_type) AS top_error_type
          FROM ci_debug_escalation_events
          WHERE event_timestamp >= NOW() - INTERVAL '7 days'
        `),
      ]);

      const rawSummary = ((summaryRows.rows ?? []) as unknown[])[0];
      const recent = (recentRows.rows ?? []).map((row) => ciDebugEscalationRowSchema.parse(row));
      const summary = ciDebugEscalationSummarySchema.parse({
        total_events: Number((rawSummary as { total_events?: unknown })?.total_events ?? 0),
        affected_runs: Number((rawSummary as { affected_runs?: unknown })?.affected_runs ?? 0),
        unresolved_count: Number(
          (rawSummary as { unresolved_count?: unknown })?.unresolved_count ?? 0
        ),
        top_error_type: (rawSummary as { top_error_type?: unknown })?.top_error_type ?? null,
      });

      return ciDebugEscalationPayloadSchema.parse({ recent, summary });
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('ci_debug_escalation_events') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
