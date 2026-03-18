/**
 * OmniMemory API Routes (OMN-5290)
 *
 * REST endpoints for the /memory dashboard page.
 * Data served via MemoryProjection (DB-backed, TTL-cached).
 * Per OMN-2325: no direct DB imports in route files.
 *
 * Endpoints:
 *   GET /api/memory/stats      — totals and status breakdown for memory_documents
 *   GET /api/memory/documents  — paginated list of memory documents (newest-first)
 *   GET /api/memory/retrievals — paginated list of memory retrievals (newest-first)
 */

import { Router, type Request, type Response } from 'express';
import { memoryProjection } from './projection-bootstrap';

const router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: unknown): number {
  const n = parseInt(String(raw ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(raw: unknown): number {
  const n = parseInt(String(raw ?? 0), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ============================================================================
// GET /api/memory/stats
// ============================================================================
//
// Returns aggregate statistics for the memory store:
//   - total document count
//   - breakdown by status (discovered / stored / expired)
//   - total retrieval count
//   - retrieval success rate (last 24h)

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const payload = await memoryProjection.ensureFresh();
    return res.json(payload.stats);
  } catch (error) {
    console.error('[memory] Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch memory stats' });
  }
});

// ============================================================================
// GET /api/memory/documents?limit=50&offset=0
// ============================================================================

router.get('/documents', async (req: Request, res: Response) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);

  try {
    const payload = await memoryProjection.ensureFresh();
    const slice = payload.recentDocuments.slice(offset, offset + limit);
    return res.json({
      total: payload.documentTotal,
      rows: slice,
    });
  } catch (error) {
    console.error('[memory] Error fetching documents:', error);
    return res.status(500).json({ error: 'Failed to fetch memory documents' });
  }
});

// ============================================================================
// GET /api/memory/retrievals?limit=50&offset=0
// ============================================================================

router.get('/retrievals', async (req: Request, res: Response) => {
  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);

  try {
    const payload = await memoryProjection.ensureFresh();
    const slice = payload.recentRetrievals.slice(offset, offset + limit);
    return res.json({
      total: payload.retrievalTotal,
      rows: slice,
    });
  } catch (error) {
    console.error('[memory] Error fetching retrievals:', error);
    return res.status(500).json({ error: 'Failed to fetch memory retrievals' });
  }
});

export default router;
