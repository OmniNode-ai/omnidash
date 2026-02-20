/**
 * Context Enrichment API Routes (OMN-2280 / OMN-2373)
 *
 * REST endpoints for the context enrichment dashboard:
 * summary, by-channel, latency-distribution, token-savings,
 * similarity-quality, inflation-alerts.
 *
 * Per OMN-2325 architectural rule, route files must not import DB accessors
 * directly. All data access goes through enrichmentProjection (OMN-2373).
 */

import { Router } from 'express';
import { enrichmentProjection } from './projection-bootstrap';

const router = Router();

const VALID_WINDOWS = ['24h', '7d', '30d'] as const;

function getWindow(query: Record<string, unknown>): string | null {
  const windowParam = typeof query.window === 'string' ? query.window : '24h';
  if (!(VALID_WINDOWS as readonly string[]).includes(windowParam)) {
    return null;
  }
  return windowParam;
}

// ============================================================================
// GET /api/enrichment/summary?window=24h
// ============================================================================

router.get('/summary', async (req, res) => {
  try {
    const window = getWindow(req.query as Record<string, unknown>);
    if (window === null) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    const payload = await enrichmentProjection.ensureFreshForWindow(window);
    return res.json(payload.summary);
  } catch (error) {
    console.error('[enrichment] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch enrichment summary' });
  }
});

// ============================================================================
// GET /api/enrichment/by-channel?window=24h
// ============================================================================

router.get('/by-channel', async (req, res) => {
  try {
    const window = getWindow(req.query as Record<string, unknown>);
    if (window === null) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    const payload = await enrichmentProjection.ensureFreshForWindow(window);
    return res.json(payload.byChannel);
  } catch (error) {
    console.error('[enrichment] Error fetching by-channel:', error);
    return res.status(500).json({ error: 'Failed to fetch enrichment by channel' });
  }
});

// ============================================================================
// GET /api/enrichment/latency-distribution?window=24h
// ============================================================================

router.get('/latency-distribution', async (req, res) => {
  try {
    const window = getWindow(req.query as Record<string, unknown>);
    if (window === null) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    const payload = await enrichmentProjection.ensureFreshForWindow(window);
    return res.json(payload.latencyDistribution);
  } catch (error) {
    console.error('[enrichment] Error fetching latency-distribution:', error);
    return res.status(500).json({ error: 'Failed to fetch latency distribution' });
  }
});

// ============================================================================
// GET /api/enrichment/token-savings?window=24h
// ============================================================================

router.get('/token-savings', async (req, res) => {
  try {
    const window = getWindow(req.query as Record<string, unknown>);
    if (window === null) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    const payload = await enrichmentProjection.ensureFreshForWindow(window);
    return res.json(payload.tokenSavingsTrend);
  } catch (error) {
    console.error('[enrichment] Error fetching token-savings:', error);
    return res.status(500).json({ error: 'Failed to fetch token savings trend' });
  }
});

// ============================================================================
// GET /api/enrichment/similarity-quality?window=24h
// ============================================================================

router.get('/similarity-quality', async (req, res) => {
  try {
    const window = getWindow(req.query as Record<string, unknown>);
    if (window === null) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    const payload = await enrichmentProjection.ensureFreshForWindow(window);
    return res.json(payload.similarityQuality);
  } catch (error) {
    console.error('[enrichment] Error fetching similarity-quality:', error);
    return res.status(500).json({ error: 'Failed to fetch similarity quality' });
  }
});

// ============================================================================
// GET /api/enrichment/inflation-alerts?window=24h
// ============================================================================

router.get('/inflation-alerts', async (req, res) => {
  try {
    const window = getWindow(req.query as Record<string, unknown>);
    if (window === null) {
      return res
        .status(400)
        .json({ error: 'Invalid window parameter. Must be one of: 24h, 7d, 30d' });
    }
    const payload = await enrichmentProjection.ensureFreshForWindow(window);
    return res.json(payload.inflationAlerts);
  } catch (error) {
    console.error('[enrichment] Error fetching inflation-alerts:', error);
    return res.status(500).json({ error: 'Failed to fetch inflation alerts' });
  }
});

export default router;
