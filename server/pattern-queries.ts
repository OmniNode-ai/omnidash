/**
 * Query service for learned patterns projection.
 *
 * Owns all data access, filtering, pagination, and response transformation
 * for the learned_patterns table. Route handlers delegate here instead of
 * executing inline Drizzle queries.
 *
 * The learned_patterns table is a projection populated externally by the
 * PATLEARN system (omninode_bridge). This module is read-only.
 */

import { tryGetIntelligenceDb } from './storage';
import {
  learnedPatterns,
  type PatternListItem,
  type PaginatedPatternsResponse,
} from '@shared/intelligence-schema';
import { sql, desc, eq, gte, and, count } from 'drizzle-orm';

// Log table-missing message only once per process lifetime
let tableExistenceLogged = false;

// Valid status values (DB canonical)
export const VALID_STATUSES = ['candidate', 'provisional', 'validated', 'deprecated'] as const;
export type PatternStatus = (typeof VALID_STATUSES)[number];

export interface PatternQueryOptions {
  status?: PatternStatus;
  min_confidence?: number;
  limit: number;
  offset: number;
}

/**
 * Query learned patterns with filtering and pagination.
 *
 * Returns null when the database is not configured (caller decides
 * how to handle graceful degradation). Returns an empty result set
 * if the learned_patterns table does not exist yet.
 */
export async function queryPatterns(
  options: PatternQueryOptions
): Promise<PaginatedPatternsResponse | null> {
  const { status, min_confidence, limit, offset } = options;

  const db = tryGetIntelligenceDb();
  if (!db) return null;

  // Verify the table exists before querying
  if (!(await tableExists(db))) {
    return { patterns: [], total: 0, limit, offset };
  }

  // Build WHERE conditions — always filter to current patterns only
  const conditions: ReturnType<typeof eq>[] = [eq(learnedPatterns.isCurrent, true)];

  if (status) {
    conditions.push(eq(learnedPatterns.status, status));
  }
  if (min_confidence !== undefined) {
    conditions.push(gte(learnedPatterns.confidence, sql`${min_confidence}::numeric`));
  }

  const where = and(...conditions);

  // Total count for pagination metadata
  const countResult = await db.select({ count: count() }).from(learnedPatterns).where(where);

  const total = countResult[0]?.count ?? 0;

  // Paginated rows, ordered by quality_score DESC then created_at DESC
  const rows = await db
    .select({
      id: learnedPatterns.id,
      patternSignature: learnedPatterns.patternSignature,
      domainId: learnedPatterns.domainId,
      status: learnedPatterns.status,
      confidence: learnedPatterns.confidence,
      qualityScore: learnedPatterns.qualityScore,
      injectionCountRolling20: learnedPatterns.injectionCountRolling20,
      successCountRolling20: learnedPatterns.successCountRolling20,
      createdAt: learnedPatterns.createdAt,
      updatedAt: learnedPatterns.updatedAt,
    })
    .from(learnedPatterns)
    .where(where)
    .orderBy(desc(learnedPatterns.qualityScore), desc(learnedPatterns.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    patterns: rows.map(toPatternListItem),
    total,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the learned_patterns table exists.
 * Returns false for PG error 42P01 (undefined_table).
 */
async function tableExists(
  db: NonNullable<ReturnType<typeof tryGetIntelligenceDb>>
): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1 FROM learned_patterns LIMIT 1`);
    return true;
  } catch (err: any) {
    const code = err?.code || err?.errno || '';
    if (code === '42P01' || err?.message?.includes('does not exist')) {
      if (!tableExistenceLogged) {
        console.log('learned_patterns table does not exist - returning empty response');
        tableExistenceLogged = true;
      }
      return false;
    }
    throw err;
  }
}

/**
 * Transform a raw DB row into the stable API response DTO.
 * Handles numeric parsing (Drizzle returns PG numeric as string)
 * and the zero-safe success rate rule.
 */
function toPatternListItem(row: {
  id: string;
  patternSignature: string;
  domainId: string;
  status: string;
  confidence: string;
  qualityScore: string | null;
  injectionCountRolling20: number | null;
  successCountRolling20: number | null;
  createdAt: Date;
  updatedAt: Date;
}): PatternListItem {
  const sampleSize = row.injectionCountRolling20 ?? 0;
  const successCount = row.successCountRolling20 ?? 0;

  return {
    id: row.id,
    name: row.domainId,
    signature: row.patternSignature,
    status: row.status as PatternStatus,
    confidence: parseFloat(row.confidence),
    quality_score: parseFloat(row.qualityScore ?? '0.5'),
    usage_count_rolling_20: sampleSize,
    success_rate_rolling_20: sampleSize > 0 ? successCount / sampleSize : null,
    sample_size_rolling_20: sampleSize,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
