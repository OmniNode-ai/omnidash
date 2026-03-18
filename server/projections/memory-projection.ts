/**
 * MemoryProjection — DB-backed projection for OmniMemory data (OMN-5290)
 *
 * Projects from: memory_documents and memory_retrievals tables
 * (migration 0024_omnimemory_tables)
 *
 * Routes access this via memoryProjection.ensureFresh() — no direct DB imports
 * allowed in route files (OMN-2325).
 */

import { sql } from 'drizzle-orm';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

export interface MemoryStats {
  totalDocuments: number;
  byStatus: Record<string, number>;
  totalRetrievals: number;
  retrievalSuccessRate: number | null;
}

export interface MemoryDocumentRow {
  id: string;
  documentId: string;
  sourcePath: string | null;
  sourceType: string | null;
  contentHash: string | null;
  sizeBytes: number | null;
  status: string;
  memoryBackend: string | null;
  correlationId: string | null;
  sessionId: string | null;
  eventTimestamp: Date | null;
  ingestedAt: Date | null;
}

export interface MemoryRetrievalRow {
  id: string;
  correlationId: string | null;
  sessionId: string | null;
  queryType: string | null;
  resultCount: number;
  success: boolean;
  latencyMs: number | null;
  errorMessage: string | null;
  eventTimestamp: Date | null;
  ingestedAt: Date | null;
}

export interface MemoryPayload {
  stats: MemoryStats;
  recentDocuments: MemoryDocumentRow[];
  documentTotal: number;
  recentRetrievals: MemoryRetrievalRow[];
  retrievalTotal: number;
}

export class MemoryProjection extends DbBackedProjectionView<MemoryPayload> {
  readonly viewId = 'memory';

  protected emptyPayload(): MemoryPayload {
    return {
      stats: {
        totalDocuments: 0,
        byStatus: {},
        totalRetrievals: 0,
        retrievalSuccessRate: null,
      },
      recentDocuments: [],
      documentTotal: 0,
      recentRetrievals: [],
      retrievalTotal: 0,
    };
  }

  protected async querySnapshot(db: Db): Promise<MemoryPayload> {
    try {
      const [
        docStatus,
        docCount,
        retrievalCount,
        recentRetrievalStats,
        recentDocs,
        recentRetrievals,
      ] = await Promise.all([
        db.execute<{ status: string; count: string }>(sql`
            SELECT status, COUNT(*)::text AS count
            FROM memory_documents
            GROUP BY status
          `),
        db.execute<{ total: string }>(sql`
            SELECT COUNT(*)::text AS total FROM memory_documents
          `),
        db.execute<{ total: string }>(sql`
            SELECT COUNT(*)::text AS total FROM memory_retrievals
          `),
        db.execute<{ success: boolean; count: string }>(sql`
            SELECT success, COUNT(*)::text AS count
            FROM memory_retrievals
            WHERE event_timestamp > NOW() - INTERVAL '24 hours'
            GROUP BY success
          `),
        db.execute<Record<string, unknown>>(sql`
            SELECT id, document_id, source_path, source_type, content_hash,
                   size_bytes, status, memory_backend, correlation_id, session_id,
                   event_timestamp, ingested_at
            FROM memory_documents
            ORDER BY event_timestamp DESC
            LIMIT 50
          `),
        db.execute<Record<string, unknown>>(sql`
            SELECT id, correlation_id, session_id, query_type, result_count,
                   success, latency_ms, error_message, event_timestamp, ingested_at
            FROM memory_retrievals
            ORDER BY event_timestamp DESC
            LIMIT 50
          `),
      ]);

      const byStatus: Record<string, number> = {};
      let totalDocuments = 0;
      for (const row of docStatus.rows) {
        byStatus[row.status] = Number(row.count);
        totalDocuments += Number(row.count);
      }

      const totalRetrievals = Number(retrievalCount.rows[0]?.total ?? 0);

      let retrievalSuccessRate: number | null = null;
      const recentTotal = recentRetrievalStats.rows.reduce((sum, r) => sum + Number(r.count), 0);
      if (recentTotal > 0) {
        const successRow = recentRetrievalStats.rows.find((r) => r.success === true);
        retrievalSuccessRate = successRow
          ? Math.round((Number(successRow.count) / recentTotal) * 100)
          : 0;
      }

      return {
        stats: {
          totalDocuments,
          byStatus,
          totalRetrievals,
          retrievalSuccessRate,
        },
        recentDocuments: recentDocs.rows as unknown as MemoryDocumentRow[],
        documentTotal: Number(docCount.rows[0]?.total ?? 0),
        recentRetrievals: recentRetrievals.rows as unknown as MemoryRetrievalRow[],
        retrievalTotal: totalRetrievals,
      };
    } catch (err) {
      const pgCode = (err as { code?: string }).code;
      if (pgCode === '42P01') {
        // Memory tables not yet migrated — return empty gracefully
        return this.emptyPayload();
      }
      throw err;
    }
  }
}
