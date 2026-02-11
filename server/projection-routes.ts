/**
 * Projection Routes (OMN-2095 / OMN-2096)
 *
 * REST endpoints for querying projection view snapshots.
 * Each registered ProjectionView gets a standardized snapshot endpoint.
 *
 * Routes:
 *   GET /api/projections/:viewId/snapshot?limit=N
 *     → ProjectionResponse<T>
 *   GET /api/projections/:viewId/events?cursor=N&limit=50
 *     → ProjectionEventsResponse
 */

import { Router } from 'express';
import { z } from 'zod';
import type { ProjectionService } from './projection-service';

/** Validate viewId: alphanumeric, hyphens, underscores, max 64 chars. */
const ViewIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

const SnapshotQuerySchema = z.object({
  limit: z.coerce.number().finite().int().min(1).max(500).optional().default(100),
});

const EventsQuerySchema = z.object({
  cursor: z.coerce.number().finite().int().min(0).optional().default(0),
  limit: z.coerce.number().finite().int().min(1).max(500).optional().default(50),
});

/**
 * Create projection routes bound to a ProjectionService instance.
 * Called during server startup after views are registered.
 */
const isDev = process.env.NODE_ENV !== 'production';

export function createProjectionRoutes(projectionService: ProjectionService): Router {
  const router = Router();

  /**
   * GET /api/projections/:viewId/snapshot?limit=N
   *
   * Returns the current snapshot for a registered projection view.
   * ?limit defaults to 100, server clamps to [1, 500].
   */
  router.get('/:viewId/snapshot', (req, res) => {
    const viewIdResult = ViewIdSchema.safeParse(req.params.viewId);
    if (!viewIdResult.success) {
      return res.status(400).json({ error: 'Invalid viewId parameter' });
    }
    const viewId = viewIdResult.data;

    const view = projectionService.getView(viewId);
    if (!view) {
      return res.status(404).json({
        error: `Projection view "${viewId}" not found`,
        ...(isDev ? { availableViews: projectionService.viewIds } : {}),
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

    try {
      const { limit } = queryResult.data;
      const snapshot = view.getSnapshot({ limit });
      return res.json(snapshot);
    } catch (err) {
      console.error(`[projection-routes] Error getting snapshot for "${viewId}":`, err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'An internal error occurred while processing the projection request',
      });
    }
  });

  /**
   * GET /api/projections/:viewId/events?cursor=N&limit=50
   *
   * Returns events applied to a view since the given cursor.
   * Used for incremental catch-up by WebSocket clients.
   */
  router.get('/:viewId/events', (req, res) => {
    const viewIdResult = ViewIdSchema.safeParse(req.params.viewId);
    if (!viewIdResult.success) {
      return res.status(400).json({ error: 'Invalid viewId parameter' });
    }
    const viewId = viewIdResult.data;

    const view = projectionService.getView(viewId);
    if (!view) {
      return res.status(404).json({
        error: `Projection view "${viewId}" not found`,
        ...(isDev ? { availableViews: projectionService.viewIds } : {}),
      });
    }

    const queryResult = EventsQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: queryResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; '),
      });
    }

    try {
      const { cursor, limit } = queryResult.data;
      const response = view.getEventsSince(cursor, limit);
      return res.json(response);
    } catch (err) {
      console.error(`[projection-routes] Error getting events for "${viewId}":`, err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'An internal error occurred while processing the projection request',
      });
    }
  });

  return router;
}
