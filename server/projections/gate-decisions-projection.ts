/**
 * GateDecisionsProjection — DB-backed projection for gate decision events (OMN-2602)
 *
 * Projects from: onex.evt.omniclaude.gate-decision.v1
 * Source table:  gate_decisions (populated by read-model-consumer.ts)
 *
 * Snapshot payload shape:
 *   { recent: GateDecisionRow[]; summary: GateDecisionSummary }
 *
 * Routes access this via projectionService.getView('gate-decisions').getSnapshot()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload types
// ============================================================================

export interface GateDecisionRow {
  correlation_id: string;
  pr_number: number | null;
  repo: string | null;
  gate_name: string;
  outcome: string;
  blocking: boolean;
  created_at: string;
}

export interface GateDecisionSummary {
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  pass_rate: number;
}

export interface GateDecisionsPayload {
  recent: GateDecisionRow[];
  summary: GateDecisionSummary;
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class GateDecisionsProjection extends DbBackedProjectionView<GateDecisionsPayload> {
  readonly viewId = 'gate-decisions';

  protected emptyPayload(): GateDecisionsPayload {
    return {
      recent: [],
      summary: { total: 0, passed: 0, failed: 0, blocked: 0, pass_rate: 0 },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<GateDecisionsPayload> {
    try {
      const [recentRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            correlation_id,
            pr_number,
            repo,
            gate_name,
            outcome,
            blocking,
            created_at::text
          FROM gate_decisions
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE outcome = 'passed')::int AS passed,
            COUNT(*) FILTER (WHERE outcome = 'failed')::int AS failed,
            COUNT(*) FILTER (WHERE blocking = true)::int AS blocked
          FROM gate_decisions
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `),
      ]);

      const s = ((summaryRows.rows ?? []) as unknown[])[0] as {
        total: number;
        passed: number;
        failed: number;
        blocked: number;
      } | undefined;
      const total = Number(s?.total ?? 0);
      const passed = Number(s?.passed ?? 0);
      const failed = Number(s?.failed ?? 0);
      const blocked = Number(s?.blocked ?? 0);

      return {
        recent: (recentRows.rows ?? []) as unknown[] as GateDecisionRow[],
        summary: {
          total,
          passed,
          failed,
          blocked,
          pass_rate: total > 0 ? passed / total : 0,
        },
      };
    } catch (err) {
      // Graceful degrade: table may not exist yet
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (pgCode === '42P01' || (msg.includes('gate_decisions') && msg.includes('does not exist'))) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
