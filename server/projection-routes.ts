/**
 * Projection Routes (OMN-2096)
 *
 * REST endpoints for querying projection view snapshots.
 * Each registered ProjectionView gets a standardized snapshot endpoint.
 *
 * Routes:
 *   GET /api/projections/:viewId/snapshot?limit=N
 *     → ProjectionResponse<T>
 */

import { Router } from 'express';
import { z } from 'zod';
import type { ProjectionService } from './projection-service';

const SnapshotQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
});

/**
 * Create projection routes bound to a ProjectionService instance.
 * Called during server startup after views are registered.
 */
export function createProjectionRoutes(projectionService: ProjectionService): Router {
  const router = Router();

  /**
   * GET /api/projections/:viewId/snapshot?limit=N
   *
   * Returns the current snapshot for a registered projection view.
   * ?limit defaults to 100, server clamps to [1, 500].
   */
  router.get('/:viewId/snapshot', (req, res) => {
    const { viewId } = req.params;

    const view = projectionService.getView(viewId);
    if (!view) {
      return res.status(404).json({
        error: `Projection view "${viewId}" not found`,
        availableViews: projectionService.viewIds,
      });
    }

    const queryResult = SnapshotQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: queryResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; '),
      });
    }

    const { limit } = queryResult.data;
    const snapshot = view.getSnapshot({ limit });
    return res.json(snapshot);
  });

  /**
   * GET /api/projections/:viewId/events?cursor=N&limit=50
   *
   * Returns events applied to a view since the given cursor.
   * Used for incremental catch-up by WebSocket clients.
   */
  router.get('/:viewId/events', (req, res) => {
    const { viewId } = req.params;

    const view = projectionService.getView(viewId);
    if (!view) {
      return res.status(404).json({
        error: `Projection view "${viewId}" not found`,
        availableViews: projectionService.viewIds,
      });
    }

    const cursor = parseInt(req.query.cursor as string, 10) || 0;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 50, 1), 500);

    const response = view.getEventsSince(cursor, limit);
    return res.json(response);
  });

  return router;
}
