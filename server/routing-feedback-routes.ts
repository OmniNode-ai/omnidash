/**
 * Routing Feedback API Routes (OMN-5284)
 *
 * Provides read endpoints for routing feedback events projected from
 * onex.evt.omniintelligence.routing-feedback-processed.v1 into the
 * routing_feedback_events read-model table.
 *
 * Endpoints:
 *   GET /api/routing-feedback         — recent events + accuracy summary
 *
 * Data is served via RoutingFeedbackProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 */

import { Router, type Request, type Response } from 'express';
import { routingFeedbackProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/routing-feedback
// ============================================================================

router.get('/', async (_req: Request, res: Response) => {
  try {
    const payload = await routingFeedbackProjection.ensureFresh();
    return res.json(payload);
  } catch (error) {
    console.error('[routing-feedback] Error fetching routing feedback:', error);
    return res.status(500).json({ error: 'Failed to fetch routing feedback' });
  }
});

export default router;
