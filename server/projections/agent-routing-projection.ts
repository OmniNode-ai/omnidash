/**
 * AgentRoutingProjection — DB-backed projection for agent routing intelligence (OMN-2750)
 *
 * Encapsulates all SQL queries for the agent routing dashboard behind the
 * ProjectionView interface. Routes call ensureFresh() and access sub-fields
 * instead of executing SQL directly, following the OMN-2325 architectural rule.
 *
 * Source table: agent_routing_decisions (populated by ReadModelConsumer from
 * onex.evt.omniclaude.routing-decision.v1 Kafka events).
 *
 * Snapshot payload shape:
 *   {
 *     summary: { totalDecisions, avgConfidence, avgRoutingTime, successRate },
 *     recentDecisions: [...],
 *     strategyBreakdown: [...],
 *     agentBreakdown: [...]
 *   }
 */

import { sql } from 'drizzle-orm';
import { agentRoutingDecisions } from '@shared/intelligence-schema';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Payload types
// ============================================================================

export interface AgentRoutingSummary {
  totalDecisions: number;
  avgConfidence: number;
  avgRoutingTime: number;
  successRate: number;
  successCount: number;
}

export interface AgentRoutingRecentDecision {
  id: string;
  query: string;
  agent: string;
  confidence: number;
  time: string;
  timestamp: string;
}

export interface AgentRoutingStrategyBreakdown {
  name: string;
  count: number;
  usage: number;
  accuracy: number;
}

export interface AgentRoutingAgentBreakdown {
  agent: string;
  count: number;
  avgConfidence: number;
  avgTime: string;
  totalDecisions: number;
  successCount: number;
  successRate: number;
}

export interface AgentRoutingPayload {
  summary: AgentRoutingSummary;
  recentDecisions: AgentRoutingRecentDecision[];
  strategyBreakdown: AgentRoutingStrategyBreakdown[];
  agentBreakdown: AgentRoutingAgentBreakdown[];
}

// ============================================================================
// Projection
// ============================================================================

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// Log table-missing message only once per process lifetime
let tableExistenceLogged = false;

export class AgentRoutingProjection extends DbBackedProjectionView<AgentRoutingPayload> {
  readonly viewId = 'agent-routing';

  protected emptyPayload(): AgentRoutingPayload {
    return {
      summary: {
        totalDecisions: 0,
        avgConfidence: 0,
        avgRoutingTime: 0,
        successRate: 0,
        successCount: 0,
      },
      recentDecisions: [],
      strategyBreakdown: [],
      agentBreakdown: [],
    };
  }

  protected async querySnapshot(db: Db): Promise<AgentRoutingPayload> {
    // Verify the table exists before querying
    if (!(await this.tableExists(db))) {
      return this.emptyPayload();
    }

    const [summary, recentDecisions, strategyBreakdown, agentBreakdown] = await Promise.all([
      this.querySummary(db),
      this.queryRecentDecisions(db),
      this.queryStrategyBreakdown(db),
      this.queryAgentBreakdown(db),
    ]);

    return { summary, recentDecisions, strategyBreakdown, agentBreakdown };
  }

  // --------------------------------------------------------------------------
  // Internal query methods
  // --------------------------------------------------------------------------

  private async querySummary(db: Db): Promise<AgentRoutingSummary> {
    const result = await db
      .select({
        totalDecisions: sql<number>`COUNT(*)::int`,
        avgConfidence: sql<string>`AVG(${agentRoutingDecisions.confidenceScore})`,
        avgRoutingTime: sql<string>`AVG(${agentRoutingDecisions.routingTimeMs})`,
        successCount: sql<number>`COUNT(*) FILTER (WHERE ${agentRoutingDecisions.executionSucceeded} = true)::int`,
      })
      .from(agentRoutingDecisions);

    const row = result[0];
    const total = row?.totalDecisions ?? 0;
    const successCount = row?.successCount ?? 0;

    return {
      totalDecisions: total,
      avgConfidence: parseFloat(row?.avgConfidence ?? '0'),
      avgRoutingTime: parseFloat(row?.avgRoutingTime ?? '0'),
      successRate: total > 0 ? (successCount / total) * 100 : 0,
      successCount,
    };
  }

  private async queryRecentDecisions(db: Db): Promise<AgentRoutingRecentDecision[]> {
    const rows = await db
      .select({
        id: agentRoutingDecisions.id,
        userRequest: agentRoutingDecisions.userRequest,
        selectedAgent: agentRoutingDecisions.selectedAgent,
        confidenceScore: agentRoutingDecisions.confidenceScore,
        routingTimeMs: agentRoutingDecisions.routingTimeMs,
        createdAt: agentRoutingDecisions.createdAt,
      })
      .from(agentRoutingDecisions)
      .orderBy(sql`${agentRoutingDecisions.createdAt} DESC`)
      .limit(20);

    return rows.map((row) => ({
      id: row.id,
      query: row.userRequest,
      agent: row.selectedAgent,
      confidence: Math.round(parseFloat(row.confidenceScore) * 100),
      time: `${row.routingTimeMs}ms`,
      timestamp: row.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  private async queryStrategyBreakdown(db: Db): Promise<AgentRoutingStrategyBreakdown[]> {
    // Get total count for usage percentage calculation
    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(agentRoutingDecisions);

    const rows = await db
      .select({
        strategy: agentRoutingDecisions.routingStrategy,
        count: sql<number>`COUNT(*)::int`,
        avgConfidence: sql<string>`AVG(${agentRoutingDecisions.confidenceScore})`,
      })
      .from(agentRoutingDecisions)
      .groupBy(agentRoutingDecisions.routingStrategy);

    return rows.map((row) => ({
      name: row.strategy,
      count: row.count,
      usage: total > 0 ? Math.round((row.count / total) * 100) : 0,
      accuracy: Math.round(parseFloat(row.avgConfidence ?? '0') * 100 * 10) / 10,
    }));
  }

  private async queryAgentBreakdown(db: Db): Promise<AgentRoutingAgentBreakdown[]> {
    const rows = await db
      .select({
        agent: agentRoutingDecisions.selectedAgent,
        count: sql<number>`COUNT(*)::int`,
        avgConfidence: sql<string>`AVG(${agentRoutingDecisions.confidenceScore})`,
        avgTime: sql<string>`AVG(${agentRoutingDecisions.routingTimeMs})`,
        successCount: sql<number>`COUNT(*) FILTER (WHERE ${agentRoutingDecisions.executionSucceeded} = true)::int`,
      })
      .from(agentRoutingDecisions)
      .groupBy(agentRoutingDecisions.selectedAgent);

    return rows.map((row) => ({
      agent: row.agent,
      count: row.count,
      avgConfidence: Math.round(parseFloat(row.avgConfidence ?? '0') * 100 * 10) / 10,
      avgTime: `${Math.round(parseFloat(row.avgTime ?? '0'))}ms`,
      totalDecisions: row.count,
      successCount: row.successCount,
      successRate: row.count > 0 ? (row.successCount / row.count) * 100 : 0,
    }));
  }

  // --------------------------------------------------------------------------
  // Table existence check
  // --------------------------------------------------------------------------

  private async tableExists(db: Db): Promise<boolean> {
    try {
      await db.select().from(agentRoutingDecisions).limit(1);
      return true;
    } catch (err: unknown) {
      const pgCode = (err as { code?: string }).code;
      const isUndefinedTable =
        pgCode === '42P01' || (err instanceof Error && err.message.includes('does not exist'));

      if (isUndefinedTable) {
        if (!tableExistenceLogged) {
          console.log(
            '[agent-routing] agent_routing_decisions table does not exist — returning empty response'
          );
          tableExistenceLogged = true;
        }
        return false;
      }
      throw err;
    }
  }
}
