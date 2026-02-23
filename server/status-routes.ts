/**
 * Status Dashboard API Routes (OMN-2658)
 *
 * REST endpoints for the /status dashboard page:
 *
 *   GET /api/status/prs         - open PRs grouped by triage_state
 *   GET /api/status/prs/:repo   - PRs for one repo
 *   GET /api/status/hooks       - recent git hook events (last 50)
 *   GET /api/status/summary     - triage_state counts + CI failure repos
 *   GET /api/status/workstreams - Linear epics with progress + linked PRs
 *   POST /api/linear/snapshot   - debug/manual ingress (not primary path)
 *
 * All data comes from StatusProjection (in-memory). No direct DB access.
 * Per OMN-2325: route files must not use DB accessors directly (tryGetIntelligenceDb).
 */

import { Router, type Request, type Response } from 'express';
import { statusProjection } from './projections/status-projection';
import { isLinearSnapshotEvent } from '@shared/status-types';
import { emitStatusInvalidate } from './status-events';

const router = Router();

// ============================================================================
// GET /api/status/prs
// Returns all tracked PRs grouped by triage_state.
// ============================================================================

router.get('/prs', (_req: Request, res: Response) => {
  try {
    const grouped = statusProjection.getPRsByTriageState();
    return res.json(grouped);
  } catch (error) {
    console.error('[status] Error fetching PRs by triage state:', error);
    return res.status(500).json({ error: 'Failed to fetch PRs' });
  }
});

// ============================================================================
// GET /api/status/prs/:repo
// Returns all tracked PRs for a specific repo (URL-encoded slug accepted).
// ============================================================================

router.get('/prs/:repo(*)', (req: Request, res: Response) => {
  try {
    const repo = decodeURIComponent(req.params.repo ?? '');
    if (!repo) {
      return res.status(400).json({ error: 'Missing repo parameter' });
    }
    const prs = statusProjection.getPRsByRepo(repo);
    return res.json(prs);
  } catch (error) {
    console.error('[status] Error fetching PRs by repo:', error);
    return res.status(500).json({ error: 'Failed to fetch PRs for repo' });
  }
});

// ============================================================================
// GET /api/status/hooks?limit=50
// Returns recent git hook events (default 50, max 100).
// ============================================================================

router.get('/hooks', (req: Request, res: Response) => {
  try {
    const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
    const hooks = statusProjection.getHooks(limit);
    return res.json(hooks);
  } catch (error) {
    console.error('[status] Error fetching hook events:', error);
    return res.status(500).json({ error: 'Failed to fetch hook events' });
  }
});

// ============================================================================
// GET /api/status/summary
// Returns triage_state counts + repos with CI failures.
// ============================================================================

router.get('/summary', (_req: Request, res: Response) => {
  try {
    const summary = statusProjection.getSummary();
    return res.json(summary);
  } catch (error) {
    console.error('[status] Error fetching summary:', error);
    return res.status(500).json({ error: 'Failed to fetch status summary' });
  }
});

// ============================================================================
// GET /api/status/workstreams
// Returns current Linear workstream snapshot.
// ============================================================================

router.get('/workstreams', (_req: Request, res: Response) => {
  try {
    const result = statusProjection.getWorkstreams();
    return res.json(result);
  } catch (error) {
    console.error('[status] Error fetching workstreams:', error);
    return res.status(500).json({ error: 'Failed to fetch workstreams' });
  }
});

export default router;

// ============================================================================
// POST /api/linear/snapshot  (debug/manual ingress — separate export)
// Not mounted under /api/status — mounted at /api/linear/snapshot by routes.ts.
// ============================================================================

export const linearSnapshotRouter = Router();

linearSnapshotRouter.post('/snapshot', (req: Request, res: Response) => {
  try {
    const body: unknown = req.body;
    if (!isLinearSnapshotEvent(body)) {
      return res.status(400).json({ error: 'Invalid LinearSnapshotEvent payload' });
    }
    statusProjection.replaceWorkstreams(body);
    emitStatusInvalidate('linear');
    return res.json({ ok: true, workstreams: body.workstreams.length });
  } catch (error) {
    console.error('[status] Error ingesting linear snapshot:', error);
    return res.status(500).json({ error: 'Failed to ingest linear snapshot' });
  }
});
