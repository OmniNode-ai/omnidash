/**
 * Hot Nodes API Routes (OMN-8695)
 *
 * Returns nodes ranked by event volume (routing decision count) over a
 * configurable time window. Operators use this to see which nodes are
 * absorbing the most traffic.
 *
 * GET /api/nodes/hot?window=1h|24h|7d
 *
 * Source table: agent_routing_decisions.selected_agent
 * Fallback: node_service_registry sorted by projected_at when no routing data exists
 */

import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { getIntelligenceDb, isDatabaseConfigured } from './storage';
import { safeInterval } from './sql-safety';

const router = Router();

const WINDOW_INTERVALS: Record<string, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  '7d': '7 days',
};

/**
 * GET /api/nodes/hot?window=1h|24h|7d
 *
 * Returns top 20 nodes by routing decision count within the window.
 * Falls back to node_service_registry ordered by recency when the
 * agent_routing_decisions table has no rows in the window.
 */
router.get('/', async (req, res) => {
  if (!isDatabaseConfigured()) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const rawWindow = typeof req.query.window === 'string' ? req.query.window : '1h';
  const interval = WINDOW_INTERVALS[rawWindow];
  if (!interval) {
    return res.status(400).json({
      error: 'Invalid window parameter. Must be one of: 1h, 24h, 7d',
    });
  }

  try {
    const db = getIntelligenceDb();
    const intervalSql = safeInterval(interval);

    const result = await db.execute(sql`
      SELECT
        selected_agent  AS node_id,
        selected_agent  AS service_name,
        COUNT(*)::int   AS event_count,
        MAX(created_at) AS last_seen,
        ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC)::int AS rank
      FROM agent_routing_decisions
      WHERE created_at >= NOW() - INTERVAL ${intervalSql}
      GROUP BY selected_agent
      ORDER BY event_count DESC
      LIMIT 20
    `);

    if (result.rows && result.rows.length > 0) {
      return res.json({
        window: rawWindow,
        source: 'agent_routing_decisions',
        timestamp: new Date().toISOString(),
        nodes: result.rows,
      });
    }

    // Fallback: return recently-projected nodes from node_service_registry
    const fallback = await db.execute(sql`
      SELECT
        id                AS node_id,
        service_name,
        0                 AS event_count,
        projected_at      AS last_seen,
        ROW_NUMBER() OVER (ORDER BY projected_at DESC)::int AS rank
      FROM node_service_registry
      WHERE is_active = true
      ORDER BY projected_at DESC
      LIMIT 20
    `);

    return res.json({
      window: rawWindow,
      source: 'node_service_registry_fallback',
      timestamp: new Date().toISOString(),
      nodes: fallback.rows ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('agent_routing_decisions') && msg.includes('does not exist')) {
      return res.status(404).json({ error: 'agent_routing_decisions table not created yet' });
    }
    console.error('[hot-nodes] Error fetching hot nodes:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
