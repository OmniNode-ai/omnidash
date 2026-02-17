/**
 * Query service for learned insights projection.
 *
 * Reads from the learned_patterns table (same source as pattern-queries.ts)
 * and transforms rows into Insight / InsightsSummary / InsightsTrendPoint
 * DTOs for the Learned Insights dashboard.
 *
 * The learned_patterns table is a read-model projection populated by
 * Kafka consumers. This module is read-only.
 *
 * @see OMN-2306 - Connect Learned Insights page to OmniMemory API
 */

import { tryGetIntelligenceDb } from './storage';
import { learnedPatterns } from '@shared/intelligence-schema';
import { desc, eq, and, count, sql, getTableName } from 'drizzle-orm';
import type {
  Insight,
  InsightType,
  InsightsSummary,
  InsightsTrendPoint,
} from '@shared/insights-types';

// ---------------------------------------------------------------------------
// Table existence cache (same pattern as pattern-queries.ts)
// ---------------------------------------------------------------------------

let tableExistsCache: boolean | null = null;
let tableExistenceLogged = false;

/**
 * Reset the table-existence cache (for tests).
 */
export function resetInsightTableCache(): void {
  tableExistsCache = null;
  tableExistenceLogged = false;
}

async function tableExists(
  db: NonNullable<ReturnType<typeof tryGetIntelligenceDb>>
): Promise<boolean> {
  if (tableExistsCache === true) return true;

  try {
    await db.select().from(learnedPatterns).limit(1);
    tableExistsCache = true;
    return true;
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    const isUndefinedTable =
      pgErr.code === '42P01' || (err instanceof Error && err.message.includes('does not exist'));

    if (isUndefinedTable) {
      if (!tableExistenceLogged) {
        console.log(
          `[Insights] ${getTableName(learnedPatterns)} table does not exist - returning empty response`
        );
        tableExistenceLogged = true;
      }
      return false;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Domain-to-InsightType mapping
// ---------------------------------------------------------------------------

/**
 * Map domain_id values from the learned_patterns table to insight types.
 *
 * The learned_patterns table uses domain_id from a domain_taxonomy table.
 * We map known domains to InsightType categories. Unknown domains default
 * to 'pattern'.
 */
const DOMAIN_TO_INSIGHT_TYPE: Record<string, InsightType> = {
  code_generation: 'pattern',
  code_quality: 'convention',
  architecture: 'architecture',
  error_resolution: 'error',
  error_handling: 'error',
  debugging: 'error',
  tooling: 'tool',
  tool_usage: 'tool',
  testing: 'convention',
  documentation: 'convention',
  performance: 'pattern',
  security: 'convention',
  infrastructure: 'architecture',
  deployment: 'tool',
  refactoring: 'pattern',
};

function domainToInsightType(domainId: string): InsightType {
  return DOMAIN_TO_INSIGHT_TYPE[domainId] ?? 'pattern';
}

/**
 * Status-to-approval mapping:
 * - validated -> approved: true
 * - deprecated -> approved: false
 * - candidate/provisional -> approved: null (pending review)
 */
function statusToApproval(status: string): boolean | null {
  switch (status) {
    case 'validated':
      return true;
    case 'deprecated':
      return false;
    default:
      return null;
  }
}

/**
 * Determine if a pattern is "trending" based on recency and quality.
 * A pattern is trending if it was seen in the last 7 days and has
 * above-average quality or high recurrence.
 */
function isTrending(row: {
  lastSeenAt: Date;
  qualityScore: string | number | null;
  recurrenceCount: number;
  distinctDaysSeen: number;
}): boolean {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const isRecent = row.lastSeenAt.getTime() > sevenDaysAgo;
  const highQuality = parseFloat(String(row.qualityScore ?? '0.5')) > 0.6;
  const highRecurrence = row.recurrenceCount >= 3 || row.distinctDaysSeen >= 2;
  return isRecent && (highQuality || highRecurrence);
}

/**
 * Create a human-readable title from a pattern_signature.
 * Converts snake_case/kebab-case test names to Title Case descriptions.
 */
function signatureToTitle(signature: string): string {
  // Remove common test prefixes
  let cleaned = signature
    .replace(/^test_/, '')
    .replace(/_[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, '') // strip trailing UUIDs
    .replace(/_[0-9a-f]{8,}$/i, ''); // strip trailing hex IDs

  // Convert separators to spaces and title-case
  return (
    cleaned
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || signature.slice(0, 60)
  );
}

/**
 * Build a description from pattern metadata.
 */
function buildDescription(row: {
  domainId: string;
  patternSignature: string;
  recurrenceCount: number;
  distinctDaysSeen: number;
  keywords: string[] | null;
}): string {
  const parts: string[] = [];

  parts.push(`Domain: ${row.domainId.replace(/_/g, ' ')}`);

  if (row.recurrenceCount > 1) {
    parts.push(`observed ${row.recurrenceCount} times across ${row.distinctDaysSeen} days`);
  }

  if (row.keywords && row.keywords.length > 0) {
    parts.push(`keywords: ${row.keywords.join(', ')}`);
  }

  return parts.join(' -- ');
}

// ---------------------------------------------------------------------------
// Row type for queries
// ---------------------------------------------------------------------------

interface PatternRow {
  id: string;
  patternSignature: string;
  domainId: string;
  status: string;
  confidence: string | number; // Drizzle numeric returns string; raw double precision returns number
  qualityScore: string | number | null;
  recurrenceCount: number;
  distinctDaysSeen: number;
  keywords: string[] | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  compiledSnippet: string | null;
  sourceSessionIds: string[];
  injectionCountRolling20: number | null;
  successCountRolling20: number | null;
}

function rowToInsight(row: PatternRow): Insight {
  const confidence = parseFloat(String(row.confidence));
  return {
    id: row.id,
    type: domainToInsightType(row.domainId),
    title: signatureToTitle(row.patternSignature),
    description: buildDescription(row),
    confidence: Number.isNaN(confidence) ? 0.5 : confidence,
    evidence_count: row.sourceSessionIds?.length ?? row.recurrenceCount,
    learned_at: row.firstSeenAt.toISOString(),
    updated_at: row.lastSeenAt.toISOString(),
    trending: isTrending(row),
    approved: statusToApproval(row.status),
    details: row.compiledSnippet ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Public query functions
// ---------------------------------------------------------------------------

/**
 * Query the insights summary from learned_patterns.
 *
 * Returns null when the database is not configured (caller handles graceful degradation).
 * Returns an empty InsightsSummary if the table does not exist.
 */
export async function queryInsightsSummary(): Promise<InsightsSummary | null> {
  const db = tryGetIntelligenceDb();
  if (!db) return null;

  if (!(await tableExists(db))) {
    return {
      insights: [],
      total: 0,
      new_this_week: 0,
      avg_confidence: 0,
      total_sessions_analyzed: 0,
      by_type: { pattern: 0, convention: 0, architecture: 0, error: 0, tool: 0 },
    };
  }

  // Fetch all current patterns, ordered by quality then recency
  const rows = await db
    .select({
      id: learnedPatterns.id,
      patternSignature: learnedPatterns.patternSignature,
      domainId: learnedPatterns.domainId,
      status: learnedPatterns.status,
      confidence: learnedPatterns.confidence,
      qualityScore: learnedPatterns.qualityScore,
      recurrenceCount: learnedPatterns.recurrenceCount,
      distinctDaysSeen: learnedPatterns.distinctDaysSeen,
      keywords: learnedPatterns.keywords,
      firstSeenAt: learnedPatterns.firstSeenAt,
      lastSeenAt: learnedPatterns.lastSeenAt,
      compiledSnippet: learnedPatterns.compiledSnippet,
      sourceSessionIds: learnedPatterns.sourceSessionIds,
      injectionCountRolling20: learnedPatterns.injectionCountRolling20,
      successCountRolling20: learnedPatterns.successCountRolling20,
    })
    .from(learnedPatterns)
    .where(eq(learnedPatterns.isCurrent, true))
    .orderBy(desc(learnedPatterns.qualityScore), desc(learnedPatterns.lastSeenAt));

  const insights = rows.map(rowToInsight);
  const total = insights.length;

  // Count new insights from the last 7 days
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = insights.filter((i) => new Date(i.learned_at).getTime() > oneWeekAgo).length;

  // Average confidence
  const avgConfidence = total > 0 ? insights.reduce((sum, i) => sum + i.confidence, 0) / total : 0;

  // Count unique source sessions across all patterns
  const allSessionIds = new Set<string>();
  for (const row of rows) {
    if (row.sourceSessionIds) {
      for (const sid of row.sourceSessionIds) {
        allSessionIds.add(sid);
      }
    }
  }

  // Count by type
  const byType: Record<InsightType, number> = {
    pattern: 0,
    convention: 0,
    architecture: 0,
    error: 0,
    tool: 0,
  };
  for (const insight of insights) {
    byType[insight.type]++;
  }

  return {
    insights,
    total,
    new_this_week: newThisWeek,
    avg_confidence: avgConfidence,
    total_sessions_analyzed: allSessionIds.size,
    by_type: byType,
  };
}

/**
 * Query insight discovery trend data.
 *
 * Groups learned_patterns by the date they were first seen,
 * producing daily counts and running cumulative totals.
 *
 * Returns null when the database is not configured.
 * Returns an empty array if the table does not exist.
 */
export async function queryInsightsTrend(days: number = 14): Promise<InsightsTrendPoint[] | null> {
  const db = tryGetIntelligenceDb();
  if (!db) return null;

  if (!(await tableExists(db))) {
    return [];
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Query daily aggregations using raw SQL for date truncation.
  // We use array_length for session counting instead of LATERAL unnest
  // to avoid issues with empty arrays.
  const result = await db.execute(sql`
    SELECT
      date_trunc('day', first_seen_at)::date AS day,
      count(*)::int AS new_insights,
      avg(confidence)::float AS avg_confidence,
      coalesce(sum(array_length(source_session_ids, 1)), 0)::int AS sessions_analyzed
    FROM learned_patterns
    WHERE is_current = true
      AND first_seen_at >= ${cutoff.toISOString()}
    GROUP BY day
    ORDER BY day ASC
  `);

  // Build trend points with cumulative total
  // First, get total count of patterns before the cutoff for the cumulative baseline
  const baselineResult = await db
    .select({ count: count() })
    .from(learnedPatterns)
    .where(
      and(
        eq(learnedPatterns.isCurrent, true),
        sql`${learnedPatterns.firstSeenAt} < ${cutoff.toISOString()}`
      )
    );

  let cumulative = baselineResult[0]?.count ?? 0;

  const rows = (result as { rows?: unknown[] }).rows ?? [];

  const trend: InsightsTrendPoint[] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const dayValue = row.day;
    const dateStr =
      dayValue instanceof Date
        ? dayValue.toISOString().slice(0, 10)
        : String(dayValue).slice(0, 10);
    const newInsights = Number(row.new_insights) || 0;
    cumulative += newInsights;

    trend.push({
      date: dateStr,
      new_insights: newInsights,
      cumulative_insights: cumulative,
      avg_confidence: Number(row.avg_confidence) || 0,
      sessions_analyzed: Number(row.sessions_analyzed) || 0,
    });
  }

  // If there are gaps in the date range, fill them
  if (trend.length > 0) {
    return fillDateGaps(trend, days);
  }

  return trend;
}

/**
 * Fill date gaps in trend data so the chart shows continuous data.
 * Days with no new insights get zero values but carry forward the cumulative total.
 */
function fillDateGaps(points: InsightsTrendPoint[], days: number): InsightsTrendPoint[] {
  if (points.length === 0) return points;

  const byDate = new Map<string, InsightsTrendPoint>();
  for (const p of points) {
    byDate.set(p.date, p);
  }

  const filled: InsightsTrendPoint[] = [];
  let lastCumulative = 0;

  // Find the cumulative value just before the first data point
  const firstPoint = points[0];
  if (firstPoint) {
    lastCumulative = firstPoint.cumulative_insights - firstPoint.new_insights;
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const existing = byDate.get(dateStr);
    if (existing) {
      lastCumulative = existing.cumulative_insights;
      filled.push(existing);
    } else {
      filled.push({
        date: dateStr,
        new_insights: 0,
        cumulative_insights: lastCumulative,
        avg_confidence: 0,
        sessions_analyzed: 0,
      });
    }
  }

  return filled;
}
