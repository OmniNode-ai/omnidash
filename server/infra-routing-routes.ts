/**
 * Infrastructure Routing Decision API Routes (OMN-7447)
 *
 * REST endpoints for AdapterModelRouter provider selection decisions.
 * Source table: infra_routing_decisions (migrations/0050_infra_routing_decisions.sql)
 * Event consumed: onex.evt.omnibase-infra.routing-decided.v1
 */

import { Router } from 'express';
import { desc, sql, gte, count } from 'drizzle-orm';
import { infraRoutingDecisions } from '@shared/intelligence-schema';
import { tryGetIntelligenceDb } from './storage';

export const infraRoutingRoutes = Router();

type TimeWindow = '1h' | '24h' | '7d' | '30d';
const VALID_WINDOWS: TimeWindow[] = ['1h', '24h', '7d', '30d'];

function parseWindow(raw: unknown): TimeWindow {
  const s = String(raw ?? '24h');
  return VALID_WINDOWS.includes(s as TimeWindow) ? (s as TimeWindow) : '24h';
}

function windowToInterval(window: TimeWindow): string {
  switch (window) {
    case '1h':
      return '1 hour';
    case '24h':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
  }
}

// GET /api/infra-routing/decisions?window=24h&limit=100
infraRoutingRoutes.get('/decisions', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const window = parseWindow(req.query.window);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
    const cutoff = sql`NOW() - ${windowToInterval(window)}::interval`;

    const rows = await db
      .select()
      .from(infraRoutingDecisions)
      .where(gte(infraRoutingDecisions.createdAt, cutoff))
      .orderBy(desc(infraRoutingDecisions.createdAt))
      .limit(limit);

    return res.json({ decisions: rows, window });
  } catch (error) {
    console.error('[infra-routing] Error fetching decisions:', error);
    return res.status(500).json({ error: 'Failed to fetch infra routing decisions' });
  }
});

// GET /api/infra-routing/summary?window=24h
infraRoutingRoutes.get('/summary', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const window = parseWindow(req.query.window);
    const cutoff = sql`NOW() - ${windowToInterval(window)}::interval`;

    const [totals] = await db
      .select({
        totalDecisions: count(),
        fallbackCount: count(sql`CASE WHEN ${infraRoutingDecisions.isFallback} = TRUE THEN 1 END`),
        avgLatencyMs: sql<number>`ROUND(AVG(${infraRoutingDecisions.latencyMs}), 2)`,
      })
      .from(infraRoutingDecisions)
      .where(gte(infraRoutingDecisions.createdAt, cutoff));

    const byProvider = await db
      .select({
        provider: infraRoutingDecisions.selectedProvider,
        count: count(),
      })
      .from(infraRoutingDecisions)
      .where(gte(infraRoutingDecisions.createdAt, cutoff))
      .groupBy(infraRoutingDecisions.selectedProvider)
      .orderBy(desc(count()));

    const byModel = await db
      .select({
        model: infraRoutingDecisions.selectedModel,
        count: count(),
      })
      .from(infraRoutingDecisions)
      .where(gte(infraRoutingDecisions.createdAt, cutoff))
      .groupBy(infraRoutingDecisions.selectedModel)
      .orderBy(desc(count()));

    return res.json({
      totalDecisions: totals?.totalDecisions ?? 0,
      fallbackCount: totals?.fallbackCount ?? 0,
      fallbackRate:
        totals && totals.totalDecisions > 0
          ? Number(((totals.fallbackCount / totals.totalDecisions) * 100).toFixed(1))
          : 0,
      avgLatencyMs: totals?.avgLatencyMs ?? null,
      byProvider,
      byModel,
      window,
    });
  } catch (error) {
    console.error('[infra-routing] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch infra routing summary' });
  }
});
