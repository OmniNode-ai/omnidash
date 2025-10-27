import { Router } from 'express';
import { eventConsumer } from './event-consumer';

export const intelligenceRouter = Router();

/**
 * GET /api/intelligence/agents/summary
 * Returns agent performance metrics from in-memory event consumer
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
    const metrics = eventConsumer.getAgentMetrics();
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
 * Returns recent agent actions from in-memory event consumer
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

    const actions = eventConsumer.getRecentActions().slice(0, limit);
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
 * Returns action timeline for specific agent from in-memory event consumer
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

    const actions = eventConsumer.getActionsByAgent(agent, timeWindow).slice(0, limit);
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
 * Returns recent routing decisions from in-memory event consumer
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

    const decisions = eventConsumer.getRoutingDecisions({
      agent: agentFilter,
      minConfidence,
    }).slice(0, limit);

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
 * Health check endpoint using event consumer status
 *
 * Response format:
 * {
 *   status: "healthy" | "unhealthy",
 *   eventsProcessed: 52,
 *   recentActionsCount: 100,
 *   timestamp: "2025-10-27T12:00:00Z"
 * }
 */
intelligenceRouter.get('/health', async (req, res) => {
  try {
    const health = eventConsumer.getHealthStatus();
    res.json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});
