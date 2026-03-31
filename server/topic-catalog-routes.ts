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
import { eventBusDataSource } from './event-bus-data-source';

const router = Router();

/**
 * GET /api/catalog/status
 *
 * Returns the current topic catalog state. With the single-consumer
 * architecture (OMN-7125), EventBusDataSource is the sole consumer.
 * Catalog status is derived from EventBusDataSource's subscription state.
 */
router.get('/status', (_req, res) => {
  try {
    const isActive = eventBusDataSource.isActive();
    res.json({
      topics: [],
      warnings: isActive ? [] : ['EventBusDataSource is not active'],
      source: 'fallback' as const,
      instanceUuid: null,
    });
  } catch (err) {
    console.error('[CatalogRoutes] Error fetching catalog status:', err);
    res.status(500).json({ error: 'Failed to fetch catalog status' });
  }
});

export default router;
