/**
 * Plan Reviewer API Routes (OMN-3324)
 *
 * REST endpoints for the /plan-reviewer dashboard: recent runs, strategy
 * comparison aggregates, and model accuracy leaderboard.
 *
 * All data access goes through PlanReviewerProjection (DB-backed,
 * TTL-cached). No direct DB imports per OMN-2325 architectural rule.
 */

import { Router } from 'express';
import { planReviewerProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/plan-reviewer/runs?limit=N&strategy=X
// ============================================================================

router.get('/runs', async (req, res) => {
  try {
    const limitParam = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(String(limitParam ?? '50'), 10) || 50, 100);

    const strategyParam = Array.isArray(req.query.strategy)
      ? req.query.strategy[0]
      : req.query.strategy;

    const payload = await planReviewerProjection.ensureFresh(limit);

    if (strategyParam && typeof strategyParam === 'string') {
      return res.json(payload.runs.filter((r) => r.strategy === strategyParam));
    }

    return res.json(payload.runs);
  } catch (error) {
    console.error('[plan-reviewer] Error fetching runs:', error);
    return res.status(500).json({ error: 'Failed to fetch plan review runs' });
  }
});

// ============================================================================
// GET /api/plan-reviewer/strategies
// ============================================================================

router.get('/strategies', async (_req, res) => {
  try {
    const payload = await planReviewerProjection.ensureFresh();
    return res.json(payload.strategies);
  } catch (error) {
    console.error('[plan-reviewer] Error fetching strategies:', error);
    return res.status(500).json({ error: 'Failed to fetch strategy aggregates' });
  }
});

// ============================================================================
// GET /api/plan-reviewer/accuracy
// ============================================================================

router.get('/accuracy', async (_req, res) => {
  try {
    const payload = await planReviewerProjection.ensureFresh();
    return res.json(payload.accuracy);
  } catch (error) {
    console.error('[plan-reviewer] Error fetching accuracy:', error);
    return res.status(500).json({ error: 'Failed to fetch model accuracy' });
  }
});

export default router;
