/**
 * Event Bus Health API Routes (OMN-3192)
 *
 * REST endpoints for the Event Bus Health dashboard:
 * GET /api/event-bus-health         — all topic health summaries + summary counts
 * GET /api/event-bus-health/topics  — raw topic list only
 * GET /api/event-bus-health/summary — aggregate counts only
 *
 * Data is served from the in-memory EventBusHealthProjection singleton,
 * populated by the event-bus-health-poller Redpanda Admin API poller.
 */

import { Router } from 'express';
import { eventBusHealthProjection } from './projections/event-bus-health-projection';

const router = Router();

// ============================================================================
// GET /api/event-bus-health
// ============================================================================

router.get('/', (_req, res) => {
  try {
    const topics = eventBusHealthProjection.getAllTopics();
    const summary = eventBusHealthProjection.getSummary();
    return res.json({ topics, summary });
  } catch (error) {
    console.error('[event-bus-health] Error fetching health data:', error);
    return res.status(500).json({ error: 'Failed to fetch event bus health' });
  }
});

// ============================================================================
// GET /api/event-bus-health/topics
// ============================================================================

router.get('/topics', (_req, res) => {
  try {
    const topics = eventBusHealthProjection.getAllTopics();
    return res.json(topics);
  } catch (error) {
    console.error('[event-bus-health] Error fetching topics:', error);
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// ============================================================================
// GET /api/event-bus-health/summary
// ============================================================================

router.get('/summary', (_req, res) => {
  try {
    const summary = eventBusHealthProjection.getSummary();
    return res.json(summary);
  } catch (error) {
    console.error('[event-bus-health] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

export default router;
