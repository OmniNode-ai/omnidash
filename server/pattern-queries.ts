/**
 * Query service for learned patterns projection.
 *
 * Owns all data access, filtering, pagination, and response transformation
 * for the learned_patterns table. Route handlers delegate here instead of
 * executing inline Drizzle queries.
 *
 * The learned_patterns table is a read-model projection populated by
 * Kafka consumers into omnidash_analytics. This module is read-only.
 */

import { tryGetIntelligenceDb } from './storage';
import {
  learnedPatterns,
  type PatternListItem,
  type PaginatedPatternsResponse,
} from '@shared/intelligence-schema';
import { desc, eq, gte, and, count, getTableName, SQL } from 'drizzle-orm';

// Log table-missing message only once per process lifetime
let tableExistenceLogged = false;

// Cache: once the table is confirmed to exist, skip re-checking on every request.
// null = not yet checked; true = confirmed present.  A negative result is never
// cached so that a table created after startup is picked up on the next call.
let tableExistsCache: boolean | null = null;

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
  const conditions: SQL[] = [eq(learnedPatterns.isCurrent, true)];

  if (status) {
    conditions.push(eq(learnedPatterns.status, status));
  }
  if (min_confidence !== undefined) {
    conditions.push(gte(learnedPatterns.confidence, String(min_confidence)));
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
// Cache reset (for tests)
// ---------------------------------------------------------------------------

/**
 * Reset the module-level table-existence cache and logging flag.
 *
 * Call this alongside `resetIntelligenceDb()` in test teardown so that
 * subsequent test runs start with a clean slate.  Exported separately
 * (rather than called from storage.ts) to avoid a circular dependency
 * (pattern-queries already imports from storage).
 */
export function resetTableExistenceCache(): void {
  tableExistsCache = null;
  tableExistenceLogged = false;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the learned_patterns table exists.
 *
 * Once the table is confirmed present the result is cached for the
 * lifetime of the process (table drops in production are extremely rare).
 * A negative result is never cached so creation after startup is detected.
 *
 * Returns false for PG error 42P01 (undefined_table).
 */
async function tableExists(
  db: NonNullable<ReturnType<typeof tryGetIntelligenceDb>>
): Promise<boolean> {
  if (tableExistsCache === true) return true;

  try {
    await db.select().from(learnedPatterns).limit(1);
    tableExistsCache = true;
    return true;
  } catch (err: unknown) {
    // Safely extract a PostgreSQL error code without relying on `any`.
    const pgErr = err as { code?: string };
    const isUndefinedTable =
      pgErr.code === '42P01' || (err instanceof Error && err.message.includes('does not exist'));

    if (isUndefinedTable) {
      // Never cache a negative result — the table may be created later.
      if (!tableExistenceLogged) {
        console.log(
          `${getTableName(learnedPatterns)} table does not exist - returning empty response`
        );
        tableExistenceLogged = true;
      }
      return false;
    }

    // Unknown / connection error — do NOT cache; let the next call retry.
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

  const parsedConfidence = parseFloat(row.confidence);
  const parsedQuality = parseFloat(row.qualityScore ?? '0.5');

  return {
    id: row.id,
    name: row.domainId,
    signature: row.patternSignature,
    status: row.status as PatternStatus,
    confidence: Number.isNaN(parsedConfidence) ? 0 : parsedConfidence,
    quality_score: Number.isNaN(parsedQuality) ? 0.5 : parsedQuality,
    usage_count_rolling_20: sampleSize,
    success_rate_rolling_20: sampleSize > 0 ? successCount / sampleSize : null,
    sample_size_rolling_20: sampleSize,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
