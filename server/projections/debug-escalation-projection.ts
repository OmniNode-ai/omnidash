/**
 * DebugEscalationProjection — DB-backed projection for circuit breaker events (OMN-2602)
 *
 * Projects from: onex.evt.omniclaude.circuit-breaker-tripped.v1
 * Source table:  debug_escalation_counts (populated by read-model-consumer.ts)
 *
 * Snapshot payload shape:
 *   { recent: DebugEscalationRow[]; summary: DebugEscalationSummary }
 *
 * Routes access this via projectionService.getView('debug-escalation').getSnapshot()
 * — no direct DB imports allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload types
// ============================================================================

export interface DebugEscalationRow {
  correlation_id: string;
  session_id: string | null;
  agent_name: string;
  escalation_count: number;
  tripped: boolean;
  repo: string | null;
  created_at: string;
}

export interface DebugEscalationSummary {
  total_trips: number;
  affected_agents: number;
  affected_sessions: number;
  top_agent: string | null;
}

export interface DebugEscalationPayload {
  recent: DebugEscalationRow[];
  summary: DebugEscalationSummary;
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export class DebugEscalationProjection extends DbBackedProjectionView<DebugEscalationPayload> {
  readonly viewId = 'debug-escalation';

  protected emptyPayload(): DebugEscalationPayload {
    return {
      recent: [],
      summary: {
        total_trips: 0,
        affected_agents: 0,
        affected_sessions: 0,
        top_agent: null,
      },
    };
  }

  protected async querySnapshot(db: Db, limit = 50): Promise<DebugEscalationPayload> {
    try {
      const [recentRows, summaryRows] = await Promise.all([
        db.execute(sql`
          SELECT
            correlation_id,
            session_id,
            agent_name,
            escalation_count,
            tripped,
            repo,
            created_at::text
          FROM debug_escalation_counts
          WHERE tripped = true
          ORDER BY created_at DESC
          LIMIT ${limit}
        `),
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_trips,
            COUNT(DISTINCT agent_name)::int AS affected_agents,
            COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)::int AS affected_sessions,
            MODE() WITHIN GROUP (ORDER BY agent_name) AS top_agent
          FROM debug_escalation_counts
          WHERE tripped = true
            AND created_at >= NOW() - INTERVAL '7 days'
        `),
      ]);

      const s = ((summaryRows.rows ?? []) as unknown[])[0] as {
        total_trips: number;
        affected_agents: number;
        affected_sessions: number;
        top_agent: string | null;
      } | undefined;

      return {
        recent: (recentRows.rows ?? []) as unknown[] as DebugEscalationRow[],
        summary: {
          total_trips: Number(s?.total_trips ?? 0),
          affected_agents: Number(s?.affected_agents ?? 0),
          affected_sessions: Number(s?.affected_sessions ?? 0),
          top_agent: s?.top_agent ?? null,
        },
      };
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (
        pgCode === '42P01' ||
        (msg.includes('debug_escalation_counts') && msg.includes('does not exist'))
      ) {
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
