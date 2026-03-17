/**
 * Pattern Lifecycle API Routes (OMN-5283)
 *
 * API endpoints for querying pattern lifecycle state transitions from the
 * pattern_lifecycle_transitions table. These endpoints power the
 * /pattern-lifecycle page.
 *
 * Endpoints:
 *   GET /api/pattern-lifecycle/recent        - Recent transitions (last 100)
 *   GET /api/pattern-lifecycle/state-summary - Count of transitions per to_status
 *   GET /api/pattern-lifecycle/trend         - Transition count by day (last 30 days)
 */

import { Router } from 'express';
import { desc, sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import { patternLifecycleTransitions } from '@shared/intelligence-schema';

const router = Router();

// ============================================================================
// GET /recent — Recent lifecycle transitions
// ============================================================================

router.get('/recent', async (req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      res.status(503).json({ error: 'Database not available' });
      return;
    }

    const rawLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;

    const rows = await db
      .select({
        id: patternLifecycleTransitions.id,
        patternId: patternLifecycleTransitions.patternId,
        fromStatus: patternLifecycleTransitions.fromStatus,
        toStatus: patternLifecycleTransitions.toStatus,
        transitionTrigger: patternLifecycleTransitions.transitionTrigger,
        actor: patternLifecycleTransitions.actor,
        reason: patternLifecycleTransitions.reason,
        correlationId: patternLifecycleTransitions.correlationId,
        transitionAt: patternLifecycleTransitions.transitionAt,
      })
      .from(patternLifecycleTransitions)
      .orderBy(desc(patternLifecycleTransitions.transitionAt))
      .limit(limit);

    res.json(rows);
  } catch (error) {
    console.error('[pattern-lifecycle] Error fetching recent transitions:', error);
    res.status(500).json({
      error: 'Failed to fetch recent transitions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// GET /state-summary — Distribution of patterns across lifecycle states
// ============================================================================

router.get('/state-summary', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      res.status(503).json({ error: 'Database not available' });
      return;
    }

    // Count transitions by to_status (final states reached)
    const rows = await db
      .select({
        state: patternLifecycleTransitions.toStatus,
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(patternLifecycleTransitions)
      .groupBy(patternLifecycleTransitions.toStatus)
      .orderBy(sql`count(*) DESC`);

    res.json(rows);
  } catch (error) {
    console.error('[pattern-lifecycle] Error fetching state summary:', error);
    res.status(500).json({
      error: 'Failed to fetch state summary',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// GET /trend — Transition count per day over last 30 days
// ============================================================================

router.get('/trend', async (_req, res) => {
  try {
    const db = tryGetIntelligenceDb();
    if (!db) {
      res.status(503).json({ error: 'Database not available' });
      return;
    }

    const rows = await db
      .select({
        day: sql<string>`date_trunc('day', ${patternLifecycleTransitions.transitionAt})::text`.as(
          'day'
        ),
        count: sql<number>`count(*)::int`.as('count'),
      })
      .from(patternLifecycleTransitions)
      .where(
        sql`${patternLifecycleTransitions.transitionAt} >= now() - interval '30 days'`
      )
      .groupBy(sql`date_trunc('day', ${patternLifecycleTransitions.transitionAt})`)
      .orderBy(sql`date_trunc('day', ${patternLifecycleTransitions.transitionAt}) ASC`);

    res.json(rows);
  } catch (error) {
    console.error('[pattern-lifecycle] Error fetching trend:', error);
    res.status(500).json({
      error: 'Failed to fetch trend',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
