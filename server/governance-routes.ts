/**
 * Governance API Routes (OMN-5291)
 *
 * REST endpoints for the Governance dashboard:
 * GET /api/governance/snapshot  — recent governance events + summary
 *
 * Data is served via GovernanceProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { governanceProjection } from './projection-bootstrap';

const router = Router();

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await governanceProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[governance] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch governance snapshot' });
  }
});

export default router;
