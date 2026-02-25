/**
 * PipelineBudgetProjection — DB-backed projection for pipeline budget state (OMN-2602)
 *
 * Projects from: onex.evt.omniclaude.budget-cap-hit.v1
 * Source table:  pipeline_budget_state (populated by read-model-consumer.ts)
 *
 * Snapshot payload shape:
 *   { recent: PipelineBudgetRow[]; summary: PipelineBudgetSummary }
 *
 * Routes access this via projectionService.getView('pipeline-budget').getSnapshot()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';
import {
  pipelineBudgetRowSchema,
  pipelineBudgetSummarySchema,
  pipelineBudgetPayloadSchema,
  type PipelineBudgetRow,
  type PipelineBudgetSummary,
  type PipelineBudgetPayload,
} from '@shared/omniclaude-state-schema';

// ============================================================================
// Payload types — derived from Drizzle schema + Zod (OMN-2602)
// Re-export so client code can import from this projection file directly.
// ============================================================================

export type { PipelineBudgetRow, PipelineBudgetSummary, PipelineBudgetPayload };

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class PipelineBudgetProjection extends DbBackedProjectionView<PipelineBudgetPayload> {
  readonly viewId = 'pipeline-budget';

  protected emptyPayload(): PipelineBudgetPayload {
    return {
      recent: [],
      summary: {
        total_cap_hits: 0,
        affected_pipelines: 0,
        token_cap_hits: 0,
        cost_cap_hits: 0,
      },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<PipelineBudgetPayload> {
    try {
      const [recentRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            correlation_id,
            pipeline_id,
            budget_type,
            cap_value,
            current_value,
            cap_hit,
            repo,
            created_at::text
          FROM pipeline_budget_state
          WHERE cap_hit = true
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_cap_hits,
            COUNT(DISTINCT pipeline_id)::int AS affected_pipelines,
            COUNT(*) FILTER (WHERE budget_type = 'tokens')::int AS token_cap_hits,
            COUNT(*) FILTER (WHERE budget_type = 'cost')::int AS cost_cap_hits
          FROM pipeline_budget_state
          WHERE cap_hit = true
            AND created_at >= NOW() - INTERVAL '7 days'
        `),
      ]);

      const rawSummary = ((summaryRows.rows ?? []) as unknown[])[0];
      const recent = (recentRows.rows ?? []).map((row) => pipelineBudgetRowSchema.parse(row));
      const summary = pipelineBudgetSummarySchema.parse({
        total_cap_hits: Number((rawSummary as { total_cap_hits?: unknown })?.total_cap_hits ?? 0),
        affected_pipelines: Number(
          (rawSummary as { affected_pipelines?: unknown })?.affected_pipelines ?? 0
        ),
        token_cap_hits: Number((rawSummary as { token_cap_hits?: unknown })?.token_cap_hits ?? 0),
        cost_cap_hits: Number((rawSummary as { cost_cap_hits?: unknown })?.cost_cap_hits ?? 0),
      });

      return pipelineBudgetPayloadSchema.parse({ recent, summary });
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('pipeline_budget_state') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
