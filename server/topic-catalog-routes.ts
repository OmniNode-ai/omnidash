/**
 * Topic Catalog API Routes (OMN-2315)
 *
 * Exposes the current topic catalog state so the UI can surface warnings
 * and show whether the dashboard is using catalog-discovered or hardcoded
 * fallback topics.
 *
 * Routes:
 *   GET /api/catalog/status
 *     Returns the current catalog state:
 *       {
 *         topics: string[],        // active subscription topics
 *         warnings: string[],      // advisory messages from catalog service
 *         source: 'catalog' | 'fallback',
 *         instanceUuid: string | null
 *       }
 */

import { Router } from 'express';
import { eventConsumer } from './event-consumer';

const router = Router();

/**
 * GET /api/catalog/status
 *
 * Returns the current topic catalog state including active topics, any
 * warnings received from the catalog service, the data source
 * ('catalog' or 'fallback'), and the per-process instance UUID.
 */
router.get('/status', (_req, res) => {
  try {
    const status = eventConsumer.getCatalogStatus();
    res.json(status);
  } catch (err) {
    console.error('[CatalogRoutes] Error fetching catalog status:', err);
    res.status(500).json({ error: 'Failed to fetch catalog status' });
  }
});

export default router;
