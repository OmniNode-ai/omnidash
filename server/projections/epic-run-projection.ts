/**
 * EpicRunProjection — DB-backed projection for epic pipeline events (OMN-2602)
 *
 * Projects from: onex.evt.omniclaude.epic-run-updated.v1
 * Source tables: epic_run_lease + epic_run_events (populated by read-model-consumer.ts)
 *
 * Snapshot payload shape:
 *   { events: EpicRunEventRow[]; leases: EpicRunLeaseRow[]; summary: EpicRunSummary }
 *
 * Routes access this via projectionService.getView('epic-run').getSnapshot()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import {
  epicRunEventRowSchema,
  epicRunLeaseRowSchema,
  epicRunSummarySchema,
  epicRunPayloadSchema,
  type EpicRunEventRow,
  type EpicRunLeaseRow,
  type EpicRunSummary,
  type EpicRunPayload,
} from '@shared/omniclaude-state-schema';

// ============================================================================
// Payload types — derived from Drizzle schema + Zod (OMN-2602)
// Re-export so client code can import from this projection file directly.
// ============================================================================

export type { EpicRunEventRow, EpicRunLeaseRow, EpicRunSummary, EpicRunPayload };

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class EpicRunProjection extends DbBackedProjectionView<EpicRunPayload> {
  readonly viewId = 'epic-run';

  protected emptyPayload(): EpicRunPayload {
    return {
      events: [],
      leases: [],
      summary: { active_runs: 0, total_events: 0, recent_event_types: [] },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<EpicRunPayload> {
    try {
      const [eventRows, leaseRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            correlation_id,
            epic_run_id,
            event_type,
            ticket_id,
            repo,
            created_at::text
          FROM epic_run_events
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            epic_run_id,
            lease_holder,
            lease_expires_at::text,
            updated_at::text
          FROM epic_run_lease
          WHERE lease_expires_at > NOW() OR lease_expires_at IS NULL
          ORDER BY updated_at DESC
          LIMIT 20
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_events,
            COUNT(DISTINCT epic_run_id)::int AS active_runs,
            STRING_AGG(DISTINCT event_type, ',' ORDER BY event_type) AS recent_types
          FROM epic_run_events
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `),
      ]);

      const rawSummary = ((summaryRows.rows ?? []) as unknown[])[0];
      const events = (eventRows.rows ?? []).map((row) => epicRunEventRowSchema.parse(row));
      const leases = (leaseRows.rows ?? []).map((row) => epicRunLeaseRowSchema.parse(row));
      const recentTypes = (rawSummary as { recent_types?: unknown })?.recent_types;
      const summary = epicRunSummarySchema.parse({
        active_runs: Number((rawSummary as { active_runs?: unknown })?.active_runs ?? 0),
        total_events: Number((rawSummary as { total_events?: unknown })?.total_events ?? 0),
        recent_event_types:
          typeof recentTypes === 'string' && recentTypes ? recentTypes.split(',') : [],
      });

      return epicRunPayloadSchema.parse({ events, leases, summary });
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        ((msg.includes('epic_run_events') || msg.includes('epic_run_lease')) &&
          msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
