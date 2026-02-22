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

// ============================================================================
// Payload types
// ============================================================================

export interface EpicRunEventRow {
  correlation_id: string;
  epic_run_id: string;
  event_type: string;
  ticket_id: string | null;
  repo: string | null;
  created_at: string;
}

export interface EpicRunLeaseRow {
  epic_run_id: string;
  lease_holder: string;
  lease_expires_at: string | null;
  updated_at: string;
}

export interface EpicRunSummary {
  active_runs: number;
  total_events: number;
  recent_event_types: string[];
}

export interface EpicRunPayload {
  events: EpicRunEventRow[];
  leases: EpicRunLeaseRow[];
  summary: EpicRunSummary;
}

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

      const s = ((summaryRows.rows ?? []) as unknown[])[0] as {
        total_events: number;
        active_runs: number;
        recent_types: string | null;
      } | undefined;

      return {
        events: (eventRows.rows ?? []) as unknown[] as EpicRunEventRow[],
        leases: (leaseRows.rows ?? []) as unknown[] as EpicRunLeaseRow[],
        summary: {
          active_runs: Number(s?.active_runs ?? 0),
          total_events: Number(s?.total_events ?? 0),
          recent_event_types: s?.recent_types ? s.recent_types.split(',') : [],
        },
      };
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
