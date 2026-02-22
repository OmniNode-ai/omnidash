/**
 * Epic Run API Routes (OMN-2602)
 *
 * REST endpoints for the epic pipeline dashboard:
 * GET /api/epic-run/snapshot  — events, leases + summary
 *
 * Data is served via EpicRunProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { epicRunProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/epic-run/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await epicRunProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[epic-run] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch epic run snapshot' });
  }
});

export default router;
