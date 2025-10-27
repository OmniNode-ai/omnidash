import { Router } from 'express';
import { intelligenceDb } from './storage';
import { agentRoutingDecisions, agentActions } from '../shared/intelligence-schema';
import { desc, gte, sql, count, eq, and } from 'drizzle-orm';

export const intelligenceRouter = Router();

/**
 * GET /api/intelligence/agents/summary
 * Returns agent performance metrics for last 24 hours
 *
 * Response format:
 * [
 *   {
 *     agent: "agent-name",
 *     totalRequests: 100,
 *     avgRoutingTime: 50.5,
 *     avgConfidence: 0.87
 *   }
 * ]
 */
intelligenceRouter.get('/agents/summary', async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const metrics = await intelligenceDb
      .select({
        agent: agentRoutingDecisions.selectedAgent,
        totalRequests: count(),
        avgRoutingTime: sql<number>`AVG(${agentRoutingDecisions.routingTimeMs})`,
        avgConfidence: sql<number>`AVG(${agentRoutingDecisions.confidenceScore})`,
      })
      .from(agentRoutingDecisions)
      .where(gte(agentRoutingDecisions.createdAt, last24h))
      .groupBy(agentRoutingDecisions.selectedAgent)
      .orderBy(desc(count()));

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching agent summary:', error);
    res.status(500).json({
      error: 'Failed to fetch agent summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intelligence/actions/recent?limit=100
 * Returns recent agent actions across all agents
 *
 * Query parameters:
 * - limit: number of actions to return (default: 100, max: 1000)
 *
 * Response format:
 * [
 *   {
 *     id: "uuid",
 *     correlationId: "uuid",
 *     agentName: "agent-name",
 *     actionType: "tool_call",
 *     actionName: "Read",
 *     actionDetails: {},
 *     debugMode: true,
 *     durationMs: 50,
 *     createdAt: "2025-10-27T12:00:00Z"
 *   }
 * ]
 */
intelligenceRouter.get('/actions/recent', async (req, res) => {
  try {
    const limit = Math.min(
      parseInt(req.query.limit as string) || 100,
      1000
    );

    const actions = await intelligenceDb
      .select()
      .from(agentActions)
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);

    res.json(actions);
  } catch (error) {
    console.error('Error fetching recent actions:', error);
    res.status(500).json({
      error: 'Failed to fetch recent actions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intelligence/agents/:agent/actions
 * Returns action timeline for specific agent
 *
 * URL parameters:
 * - agent: agent name (e.g., "agent-api-architect")
 *
 * Query parameters:
 * - timeWindow: time window ("1h", "24h", "7d") (default: "1h")
 * - limit: number of actions to return (default: 100, max: 1000)
 *
 * Response format: Same as /actions/recent
 */
intelligenceRouter.get('/agents/:agent/actions', async (req, res) => {
  try {
    const { agent } = req.params;
    const timeWindow = (req.query.timeWindow as string) || '1h';
    const limit = Math.min(
      parseInt(req.query.limit as string) || 100,
      1000
    );

    // Parse time window
    let windowMs: number;
    switch (timeWindow) {
      case '1h':
        windowMs = 60 * 60 * 1000;
        break;
      case '24h':
        windowMs = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        windowMs = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        windowMs = 60 * 60 * 1000; // Default to 1h
    }

    const since = new Date(Date.now() - windowMs);

    const actions = await intelligenceDb
      .select()
      .from(agentActions)
      .where(
        and(
          eq(agentActions.agentName, agent),
          gte(agentActions.createdAt, since)
        )
      )
      .orderBy(desc(agentActions.createdAt))
      .limit(limit);

    res.json(actions);
  } catch (error) {
    console.error('Error fetching agent actions:', error);
    res.status(500).json({
      error: 'Failed to fetch agent actions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intelligence/routing/decisions?limit=100
 * Returns recent routing decisions across all agents
 *
 * Query parameters:
 * - limit: number of decisions to return (default: 100, max: 1000)
 * - agent: filter by specific agent name (optional)
 * - minConfidence: minimum confidence score (0.0-1.0) (optional)
 *
 * Response format:
 * [
 *   {
 *     id: "uuid",
 *     correlationId: "uuid",
 *     userRequest: "optimize my API",
 *     selectedAgent: "agent-performance",
 *     confidenceScore: 0.92,
 *     routingStrategy: "enhanced_fuzzy_matching",
 *     alternatives: [...],
 *     reasoning: "High confidence match",
 *     routingTimeMs: 45,
 *     createdAt: "2025-10-27T12:00:00Z"
 *   }
 * ]
 */
intelligenceRouter.get('/routing/decisions', async (req, res) => {
  try {
    const limit = Math.min(
      parseInt(req.query.limit as string) || 100,
      1000
    );
    const agentFilter = req.query.agent as string;
    const minConfidence = req.query.minConfidence
      ? parseFloat(req.query.minConfidence as string)
      : undefined;

    // Build where conditions
    const conditions = [];
    if (agentFilter) {
      conditions.push(eq(agentRoutingDecisions.selectedAgent, agentFilter));
    }
    if (minConfidence !== undefined) {
      conditions.push(
        sql`${agentRoutingDecisions.confidenceScore} >= ${minConfidence}`
      );
    }

    const decisions = await intelligenceDb
      .select()
      .from(agentRoutingDecisions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentRoutingDecisions.createdAt))
      .limit(limit);

    res.json(decisions);
  } catch (error) {
    console.error('Error fetching routing decisions:', error);
    res.status(500).json({
      error: 'Failed to fetch routing decisions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/intelligence/health
 * Health check endpoint for intelligence infrastructure
 *
 * Response format:
 * {
 *   status: "healthy" | "unhealthy",
 *   database: "connected" | "error",
 *   timestamp: "2025-10-27T12:00:00Z"
 * }
 */
intelligenceRouter.get('/health', async (req, res) => {
  try {
    // Simple query to check database connectivity
    await intelligenceDb
      .select({ count: count() })
      .from(agentRoutingDecisions)
      .limit(1);

    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      database: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
