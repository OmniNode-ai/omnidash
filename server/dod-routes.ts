/**
 * DoD Verification API Routes (OMN-5200)
 *
 * REST endpoints for the DoD verification dashboard:
 * GET /api/dod/snapshot  — full payload: stats + verify runs + guard events + trends
 *
 * Data is served via DodProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { dodProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/dod/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await dodProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[dod] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch DoD verification snapshot' });
  }
});

export default router;
