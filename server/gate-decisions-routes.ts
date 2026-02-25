/**
 * Gate Decisions API Routes (OMN-2602)
 *
 * REST endpoints for the gate decisions dashboard:
 * GET /api/gate-decisions/snapshot  — recent rows + summary
 *
 * Data is served via GateDecisionsProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { gateDecisionsProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/gate-decisions/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await gateDecisionsProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[gate-decisions] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch gate decisions snapshot' });
  }
});

export default router;
