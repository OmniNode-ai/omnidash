/**
 * OmniMemory API Routes (OMN-5290)
 *
 * REST endpoints for the /memory dashboard page.
 *
 * Endpoints:
 *   GET /api/memory/stats      — totals and status breakdown for memory_documents
 *   GET /api/memory/documents  — paginated list of memory documents (newest-first)
 *   GET /api/memory/retrievals — paginated list of memory retrievals (newest-first)
 *
 * Data source: memory_documents and memory_retrievals tables (read-model projection).
 */

import { Router, type Request, type Response } from 'express';
import { desc, count, sql } from 'drizzle-orm';
import { tryGetIntelligenceDb } from './storage';
import { memoryDocuments, memoryRetrievals } from '@shared/intelligence-schema';

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
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({
      totalDocuments: 0,
      byStatus: {},
      totalRetrievals: 0,
      retrievalSuccessRate: null,
    });
  }

  try {
    const [docStats, retrievalStats, recentRetrievals] = await Promise.all([
      db
        .select({
          status: memoryDocuments.status,
          count: count(),
        })
        .from(memoryDocuments)
        .groupBy(memoryDocuments.status),

      db
        .select({ total: count() })
        .from(memoryRetrievals),

      db
        .select({
          success: memoryRetrievals.success,
          count: count(),
        })
        .from(memoryRetrievals)
        .where(sql`event_timestamp > NOW() - INTERVAL '24 hours'`)
        .groupBy(memoryRetrievals.success),
    ]);

    const byStatus: Record<string, number> = {};
    let totalDocuments = 0;
    for (const row of docStats) {
      byStatus[row.status] = Number(row.count);
      totalDocuments += Number(row.count);
    }

    const totalRetrievals = Number(retrievalStats[0]?.total ?? 0);

    let retrievalSuccessRate: number | null = null;
    const recentTotal = recentRetrievals.reduce((sum, r) => sum + Number(r.count), 0);
    if (recentTotal > 0) {
      const successRow = recentRetrievals.find((r) => r.success === true);
      retrievalSuccessRate = successRow
        ? Math.round((Number(successRow.count) / recentTotal) * 100)
        : 0;
    }

    return res.json({
      totalDocuments,
      byStatus,
      totalRetrievals,
      retrievalSuccessRate,
    });
  } catch (error) {
    console.error('[memory] Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch memory stats' });
  }
});

// ============================================================================
// GET /api/memory/documents?limit=50&offset=0
// ============================================================================

router.get('/documents', async (req: Request, res: Response) => {
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ total: 0, rows: [] });
  }

  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);

  try {
    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(memoryDocuments)
        .orderBy(desc(memoryDocuments.eventTimestamp))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(memoryDocuments),
    ]);

    return res.json({
      total: Number(totalResult[0]?.total ?? 0),
      rows,
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
  const db = tryGetIntelligenceDb();
  if (!db) {
    return res.json({ total: 0, rows: [] });
  }

  const limit = parseLimit(req.query.limit);
  const offset = parseOffset(req.query.offset);

  try {
    const [rows, totalResult] = await Promise.all([
      db
        .select()
        .from(memoryRetrievals)
        .orderBy(desc(memoryRetrievals.eventTimestamp))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(memoryRetrievals),
    ]);

    return res.json({
      total: Number(totalResult[0]?.total ?? 0),
      rows,
    });
  } catch (error) {
    console.error('[memory] Error fetching retrievals:', error);
    return res.status(500).json({ error: 'Failed to fetch memory retrievals' });
  }
});

export default router;
