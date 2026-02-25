/**
 * Pipeline Budget API Routes (OMN-2602)
 *
 * REST endpoints for the pipeline budget dashboard:
 * GET /api/pipeline-budget/snapshot  — recent cap-hit rows + summary
 *
 * Data is served via PipelineBudgetProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { pipelineBudgetProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/pipeline-budget/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await pipelineBudgetProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[pipeline-budget] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch pipeline budget snapshot' });
  }
});

export default router;
