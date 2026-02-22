/**
 * Debug Escalation API Routes (OMN-2602)
 *
 * REST endpoints for the debug escalation / circuit breaker dashboard:
 * GET /api/debug-escalation/snapshot  — recent tripped rows + summary
 *
 * Data is served via DebugEscalationProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router } from 'express';
import { debugEscalationProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/debug-escalation/snapshot
// ============================================================================

router.get('/snapshot', async (_req, res) => {
  try {
    const payload = await debugEscalationProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[debug-escalation] Error fetching snapshot:', error);
    return res.status(500).json({ error: 'Failed to fetch debug escalation snapshot' });
  }
});

export default router;
