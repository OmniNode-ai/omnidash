/**
 * Baselines & ROI API Routes (OMN-2331)
 *
 * REST endpoints for the baselines/ROI dashboard: summary, comparisons,
 * trend, and recommendation breakdown.
 *
 * All responses are derived from the latest baselines snapshot stored in
 * omnidash_analytics (populated by the ReadModelConsumer projecting
 * onex.evt.omnibase-infra.baselines-computed.v1 events).
 *
 * "Latest snapshot" = row with MAX(computed_at_utc) in baselines_snapshots.
 * Data is served via BaselinesProjection (DB-backed, TTL-cached).
 */

import { Router } from 'express';
import { baselinesProjection } from './projection-bootstrap';

const router = Router();

// ============================================================================
// GET /api/baselines/summary
// ============================================================================

router.get('/summary', async (_req, res) => {
  try {
    const payload = await baselinesProjection.ensureFresh();
    return res.json(payload.summary);
  } catch (error) {
    console.error('[baselines] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines summary' });
  }
});

// ============================================================================
// GET /api/baselines/comparisons
// ============================================================================

router.get('/comparisons', async (_req, res) => {
  try {
    const payload = await baselinesProjection.ensureFresh();
    return res.json(payload.comparisons);
  } catch (error) {
    console.error('[baselines] Error fetching comparisons:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines comparisons' });
  }
});

// ============================================================================
// GET /api/baselines/trend?days=N
// ============================================================================

router.get('/trend', async (req, res) => {
  try {
    const daysParam = Array.isArray(req.query.days) ? req.query.days[0] : req.query.days;
    const days = Math.min(Math.max(parseInt(String(daysParam ?? ''), 10) || 14, 1), 90);
    const payload = await baselinesProjection.ensureFreshForDays(days);
    return res.json(payload.trend);
  } catch (error) {
    console.error('[baselines] Error fetching trend:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines trend' });
  }
});

// ============================================================================
// GET /api/baselines/breakdown
// ============================================================================

router.get('/breakdown', async (_req, res) => {
  try {
    const payload = await baselinesProjection.ensureFresh();
    return res.json(payload.breakdown);
  } catch (error) {
    console.error('[baselines] Error fetching breakdown:', error);
    return res.status(500).json({ error: 'Failed to fetch baselines breakdown' });
  }
});

export default router;
