/**
 * Hook Health API Routes (OMN-7161)
 *
 * Serves hook error summary data for the hook health dashboard card.
 * Powered by HookHealthProjection.
 */

import { Router } from 'express';
import { HookHealthProjection } from './projections/hook-health-projection';

export const hookHealthRoutes = Router();

const projection = new HookHealthProjection();

/**
 * GET /api/hook-health/summary
 *
 * Returns hook error summary for a time window.
 * Query params: ?window=5m|15m|1h|24h|7d (default: 24h)
 */
hookHealthRoutes.get('/summary', async (req, res) => {
  try {
    const windowParam = String(req.query.window ?? '24h');
    let windowMinutes: number;
    if (windowParam.endsWith('m')) {
      windowMinutes = parseInt(windowParam) || 1440;
    } else if (windowParam === '1h') {
      windowMinutes = 60;
    } else if (windowParam === '7d') {
      windowMinutes = 10080;
    } else {
      windowMinutes = 1440; // default 24h
    }
    const summary = await projection.summary(windowMinutes);
    return res.json(summary);
  } catch (err) {
    console.error('[hook-health] summary query failed:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
