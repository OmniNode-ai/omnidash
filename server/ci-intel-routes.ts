/**
 * CI Intelligence API Routes (OMN-5282)
 *
 * REST endpoints for the CI Intelligence debug escalation dashboard:
 * GET /api/ci-intel/snapshot  — recent escalation rows + summary
 *
 * Data is served via CiIntelProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { ciIntelProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/ci-intel/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await ciIntelProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[ci-intel] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch CI intelligence snapshot' });
  }
});

export default router;
