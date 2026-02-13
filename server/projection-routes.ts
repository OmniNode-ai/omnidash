/**
 * Projection Routes — REST API for Projection Snapshots (OMN-2095 / OMN-2096 / OMN-2097)
 *
 * REST endpoints for querying projection view snapshots.
 * Each registered ProjectionView gets a standardized snapshot endpoint.
 *
 * Endpoints:
 *   GET /api/projections                              — list registered views
 *   GET /api/projections/:viewId/snapshot?limit=N     → ProjectionResponse<T>
 *   GET /api/projections/:viewId/events?cursor=N&limit=50 → ProjectionEventsResponse
 */

import { Router } from 'express';
import { z } from 'zod';
import type { ProjectionService } from './projection-service';

/** Zod schema for viewId path parameter: alphanumeric, hyphens, underscores, max 64 chars. */
const ViewIdSchema = z
  .string()
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/);

/** Zod schema for `GET .../snapshot` query params. Defaults limit to 100, max 5000.
 *  Upper bound matches the client's max_events_options (see event-bus-dashboard.ts). */
const SnapshotQuerySchema = z.object({
  limit: z.coerce.number().finite().int().min(1).max(5000).optional().default(100),
});

/** Zod schema for `GET .../events` query params. Cursor defaults to 0, limit to 50. */
const EventsQuerySchema = z.object({
  // .min(0) rejects negative cursors at the validation layer (Zod returns a
  // 400 error before the value reaches getEventsSince), so no additional
  // Math.max(cursor, 0) clamp is needed downstream.
  cursor: z.coerce.number().finite().int().min(0).optional().default(0),
  limit: z.coerce.number().finite().int().min(1).max(500).optional().default(50),
});

/**
 * Create an Express router with projection snapshot and events endpoints.
 * Mount at `/api/projections` during server startup after views are registered.
 *
 * @param projectionService - The service instance holding registered views
 * @returns Express Router with `/:viewId/snapshot` and `/:viewId/events` routes
 */
const isDev = process.env.NODE_ENV !== 'production';

export function createProjectionRoutes(projectionService: ProjectionService): Router {
  const router = Router();

  /**
   * GET /api/projections
   *
   * Discovery endpoint: returns the list of registered projection view IDs.
   */
  router.get('/', (_req, res) => {
    return res.json({ views: projectionService.viewIds });
  });

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
      const detail = queryResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      console.error(
        `[projection-routes] Snapshot query validation failed for "${viewId}": ${detail}`,
        { query: req.query }
      );
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: detail,
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
      const detail = queryResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      console.error(
        `[projection-routes] Events query validation failed for "${viewId}": ${detail}`,
        { query: req.query }
      );
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: detail,
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
