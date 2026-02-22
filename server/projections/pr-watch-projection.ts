/**
 * PrWatchProjection — DB-backed projection for PR watch state events (OMN-2602)
 *
 * Projects from: onex.evt.omniclaude.pr-watch-updated.v1
 * Source table:  pr_watch_state (populated by read-model-consumer.ts)
 *
 * Snapshot payload shape:
 *   { recent: PrWatchRow[]; summary: PrWatchSummary }
 *
 * Routes access this via projectionService.getView('pr-watch').getSnapshot()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload types
// ============================================================================

export interface PrWatchRow {
  correlation_id: string;
  pr_number: number | null;
  repo: string | null;
  state: string;
  checks_status: string | null;
  review_status: string | null;
  created_at: string;
}

export interface PrWatchSummary {
  total: number;
  open: number;
  merged: number;
  closed: number;
  checks_passing: number;
}

export interface PrWatchPayload {
  recent: PrWatchRow[];
  summary: PrWatchSummary;
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class PrWatchProjection extends DbBackedProjectionView<PrWatchPayload> {
  readonly viewId = 'pr-watch';

  protected emptyPayload(): PrWatchPayload {
    return {
      recent: [],
      summary: { total: 0, open: 0, merged: 0, closed: 0, checks_passing: 0 },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<PrWatchPayload> {
    try {
      const [recentRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            correlation_id,
            pr_number,
            repo,
            state,
            checks_status,
            review_status,
            created_at::text
          FROM pr_watch_state
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE state = 'open')::int AS open,
            COUNT(*) FILTER (WHERE state = 'merged')::int AS merged,
            COUNT(*) FILTER (WHERE state = 'closed')::int AS closed,
            COUNT(*) FILTER (WHERE checks_status = 'success')::int AS checks_passing
          FROM pr_watch_state
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `),
      ]);

      const s = ((summaryRows.rows ?? []) as unknown[])[0] as {
        total: number;
        open: number;
        merged: number;
        closed: number;
        checks_passing: number;
      } | undefined;

      return {
        recent: (recentRows.rows ?? []) as unknown[] as PrWatchRow[],
        summary: {
          total: Number(s?.total ?? 0),
          open: Number(s?.open ?? 0),
          merged: Number(s?.merged ?? 0),
          closed: Number(s?.closed ?? 0),
          checks_passing: Number(s?.checks_passing ?? 0),
        },
      };
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('pr_watch_state') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
