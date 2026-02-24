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
import {
  prWatchRowSchema,
  prWatchSummarySchema,
  prWatchPayloadSchema,
  type PrWatchRow,
  type PrWatchSummary,
  type PrWatchPayload,
} from '@shared/omniclaude-state-schema';

// ============================================================================
// Payload types — derived from Drizzle schema + Zod (OMN-2602)
// Re-export so client code can import from this projection file directly.
// ============================================================================

export type { PrWatchRow, PrWatchSummary, PrWatchPayload };

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

      const rawSummary = ((summaryRows.rows ?? []) as unknown[])[0];
      const recent = (recentRows.rows ?? []).map((row) => prWatchRowSchema.parse(row));
      const summary = prWatchSummarySchema.parse({
        total: Number((rawSummary as { total?: unknown })?.total ?? 0),
        open: Number((rawSummary as { open?: unknown })?.open ?? 0),
        merged: Number((rawSummary as { merged?: unknown })?.merged ?? 0),
        closed: Number((rawSummary as { closed?: unknown })?.closed ?? 0),
        checks_passing: Number((rawSummary as { checks_passing?: unknown })?.checks_passing ?? 0),
      });

      return prWatchPayloadSchema.parse({ recent, summary });
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
