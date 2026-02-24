/**
 * PR Watch API Routes (OMN-2602)
 *
 * REST endpoints for the PR watch dashboard:
 * GET /api/pr-watch/snapshot  — recent rows + summary
 *
 * Data is served via PrWatchProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { prWatchProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/pr-watch/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await prWatchProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[pr-watch] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch PR watch snapshot' });
  }
});

export default router;
