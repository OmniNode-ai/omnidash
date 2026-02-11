/**
 * Projection Routes — REST API for Projection Snapshots (OMN-2095)
 *
 * Standardized envelope responses for all projection views.
 *
 * Endpoints:
 *   GET /api/projections/:viewId/snapshot?limit=200
 *   GET /api/projections/:viewId/events?since_cursor=X&limit=50
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectionService } from './projection-service';
import { MAX_BUFFER_SIZE } from './projections/event-bus-projection';

/** Sanitize viewId: truncate + strip non-alphanumeric (defense-in-depth for Map lookup and log output). */
function sanitizeViewId(raw: string): string {
  // Truncate and strip anything outside [a-zA-Z0-9_-]
  return raw.slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
}

export function createProjectionRouter(projectionService: ProjectionService): Router {
  const router = Router();

  /**
   * GET /api/projections/:viewId/snapshot
   *
   * Returns the current materialized snapshot for the specified view.
   *
   * Query params:
   *   limit  - Max events in the snapshot (default: view-specific)
   */
  router.get('/:viewId/snapshot', (req: Request, res: Response) => {
    const { viewId } = req.params;
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const limit =
      rawLimit !== undefined && !isNaN(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MAX_BUFFER_SIZE)
        : undefined;

    const safeViewId = sanitizeViewId(viewId);
    const view = projectionService.getView(safeViewId);
    if (!view) {
      return res.status(404).json({
        error: 'not_found',
        message: `Projection view "${safeViewId}" not found`,
        availableViews: projectionService.viewIds,
      });
    }

    try {
      const snapshot = view.getSnapshot(limit !== undefined ? { limit } : undefined);
      return res.json(snapshot);
    } catch (err) {
      console.error(`[projection-routes] Error getting snapshot for "${safeViewId}":`, err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'An internal error occurred while processing the projection request',
      });
    }
  });

  /**
   * GET /api/projections/:viewId/events
   *
   * Returns events applied to the view since the given cursor.
   * Used for incremental catch-up by clients.
   *
   * Query params:
   *   since_cursor  - ingestSeq to start from (exclusive). Required.
   *   limit         - Max events to return (default: 50)
   */
  router.get('/:viewId/events', (req: Request, res: Response) => {
    const { viewId } = req.params;
    const sinceCursor = parseInt(req.query.since_cursor as string, 10);
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const limit: number =
      rawLimit !== undefined && !isNaN(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_BUFFER_SIZE)
        : 50;

    if (isNaN(sinceCursor) || sinceCursor < 0) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'since_cursor query parameter is required and must be a non-negative number',
      });
    }

    const safeViewId = sanitizeViewId(viewId);
    const view = projectionService.getView(safeViewId);
    if (!view) {
      return res.status(404).json({
        error: 'not_found',
        message: `Projection view "${safeViewId}" not found`,
        availableViews: projectionService.viewIds,
      });
    }

    try {
      const response = view.getEventsSince(sinceCursor, limit);
      return res.json(response);
    } catch (err) {
      console.error(`[projection-routes] Error getting events for "${safeViewId}":`, err);
      return res.status(500).json({
        error: 'internal_error',
        message: 'An internal error occurred while processing the projection request',
      });
    }
  });

  return router;
}
