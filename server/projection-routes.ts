/**
 * Projection Routes — REST endpoints for projection snapshots (OMN-2097)
 *
 * Provides a generic route pattern for all registered projection views:
 *   GET /api/projections/:viewId/snapshot → ProjectionResponse<T>
 *   GET /api/projections/:viewId/events?cursor=N&limit=M → ProjectionEventsResponse
 *
 * The ProjectionService must be set via setProjectionService() before
 * any requests are served.
 */

import { Router, type Request, type Response } from 'express';
import type { ProjectionService } from './projection-service';

const router = Router();

/** Only allow alphanumeric characters, hyphens, and underscores in view IDs */
const VIEW_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

let projectionService: ProjectionService | null = null;

/**
 * Inject the ProjectionService instance. Called once from server/index.ts
 * after the service is created and views are registered.
 * Throws if called more than once to prevent accidental service swaps.
 */
export function setProjectionService(service: ProjectionService): void {
  if (projectionService !== null) {
    throw new Error('ProjectionService already initialized — cannot reinitialize');
  }
  projectionService = service;
}

/**
 * GET /api/projections/:viewId/snapshot
 *
 * Returns the current materialized snapshot for the given view.
 * Query params:
 *   - limit: optional max items (view-specific semantics)
 */
router.get('/:viewId/snapshot', (req: Request, res: Response) => {
  if (!projectionService) {
    return res.status(503).json({ error: 'Projection service not initialized' });
  }

  const { viewId } = req.params;
  if (!VIEW_ID_PATTERN.test(viewId)) {
    return res
      .status(400)
      .json({ error: 'Invalid viewId format — use alphanumeric, hyphens, or underscores' });
  }
  const view = projectionService.getView(viewId);

  if (!view) {
    return res.status(404).json({ error: `Projection view "${viewId}" not found` });
  }

  const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
  const limit =
    rawLimit !== undefined && Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
  const snapshot = view.getSnapshot(limit ? { limit } : undefined);

  return res.json(snapshot);
});

/**
 * GET /api/projections/:viewId/events
 *
 * Returns events applied to the view since the given cursor position.
 * Used for incremental client catch-up.
 * Query params:
 *   - cursor: ingestSeq to start from (exclusive), defaults to 0 (all events)
 *   - limit: max events to return (default: 100)
 */
router.get('/:viewId/events', (req: Request, res: Response) => {
  if (!projectionService) {
    return res.status(503).json({ error: 'Projection service not initialized' });
  }

  const { viewId } = req.params;
  if (!VIEW_ID_PATTERN.test(viewId)) {
    return res
      .status(400)
      .json({ error: 'Invalid viewId format — use alphanumeric, hyphens, or underscores' });
  }
  const view = projectionService.getView(viewId);

  if (!view) {
    return res.status(404).json({ error: `Projection view "${viewId}" not found` });
  }

  const rawCursor = req.query.cursor ? parseInt(String(req.query.cursor), 10) : 0;
  const cursor = Number.isFinite(rawCursor) && rawCursor >= 0 ? rawCursor : 0;

  const rawLimit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100;

  const events = view.getEventsSince(cursor, limit);
  return res.json(events);
});

export default router;
