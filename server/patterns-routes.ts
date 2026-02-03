import { Router } from 'express';
import { z } from 'zod';
import { tryGetIntelligenceDb } from './storage';
import {
  learnedPatterns,
  type PatternListItem,
  type PaginatedPatternsResponse,
} from '@shared/intelligence-schema';
import { sql, desc, eq, gte, and, count } from 'drizzle-orm';

const router = Router();

// Valid status values (DB canonical)
const VALID_STATUSES = ['candidate', 'provisional', 'validated', 'deprecated'] as const;
type PatternStatus = (typeof VALID_STATUSES)[number];

// Query parameter validation schema
const PatternsQuerySchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  min_confidence: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .refine((val) => val === undefined || (val >= 0 && val <= 1), {
      message: 'min_confidence must be between 0.0 and 1.0',
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = val ? parseInt(val, 10) : 50;
      return Math.min(Math.max(parsed, 1), 250); // Clamp between 1 and 250
    }),
  offset: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = val ? parseInt(val, 10) : 0;
      return Math.max(parsed, 0); // Ensure non-negative
    }),
});

/**
 * GET /api/patterns
 *
 * Returns paginated list of learned patterns with rolling metrics.
 *
 * Query Parameters:
 * - status: candidate|provisional|validated|deprecated
 * - min_confidence: 0.0-1.0
 * - limit: 1-250 (default 50)
 * - offset: pagination offset (default 0)
 *
 * Response:
 * {
 *   patterns: PatternListItem[],
 *   total: number,
 *   limit: number,
 *   offset: number
 * }
 */
router.get('/', async (req, res) => {
  try {
    // Validate query parameters
    const queryResult = PatternsQuerySchema.safeParse(req.query);

    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const { status, min_confidence, limit, offset } = queryResult.data;

    const db = tryGetIntelligenceDb();

    // Graceful degradation: if database not configured, return empty response
    if (!db) {
      console.log('[Patterns] Database not configured - returning empty response (demo mode)');
      return res.json({
        patterns: [],
        total: 0,
        limit,
        offset,
        _demo: true,
        _message: 'Database not configured. Running in demo-only mode.',
      } as PaginatedPatternsResponse & { _demo: boolean; _message: string });
    }

    // Check if table exists first
    try {
      await db.execute(sql`SELECT 1 FROM learned_patterns LIMIT 1`);
    } catch (tableError: any) {
      const errorCode = tableError?.code || tableError?.errno || '';
      if (errorCode === '42P01' || tableError?.message?.includes('does not exist')) {
        console.log('learned_patterns table does not exist - returning empty response');
        return res.json({
          patterns: [],
          total: 0,
          limit,
          offset,
        } satisfies PaginatedPatternsResponse);
      }
      throw tableError;
    }

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [];

    // Only return current patterns (not superseded versions)
    conditions.push(eq(learnedPatterns.isCurrent, true));

    if (status) {
      conditions.push(eq(learnedPatterns.status, status));
    }

    if (min_confidence !== undefined) {
      conditions.push(gte(learnedPatterns.confidence, min_confidence.toString()));
    }

    // Get total count for pagination
    const countResult = await db
      .select({ count: count() })
      .from(learnedPatterns)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult[0]?.count ?? 0;

    // Get paginated patterns
    const patterns = await db
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(learnedPatterns.qualityScore), desc(learnedPatterns.createdAt))
      .limit(limit)
      .offset(offset);

    // Transform to API response format
    const patternItems: PatternListItem[] = patterns.map((p) => {
      const sampleSize = p.injectionCountRolling20 ?? 0;
      const successCount = p.successCountRolling20 ?? 0;

      // Zero-safe rule: null when sample_size is 0
      const successRate = sampleSize > 0 ? successCount / sampleSize : null;

      return {
        id: p.id,
        name: p.domainId,
        signature: p.patternSignature,
        status: p.status as PatternStatus,
        confidence: parseFloat(p.confidence?.toString() ?? '0'),
        quality_score: parseFloat(p.qualityScore?.toString() ?? '0.5'),
        usage_count_rolling_20: sampleSize,
        success_rate_rolling_20: successRate,
        sample_size_rolling_20: sampleSize,
        created_at: p.createdAt?.toISOString() ?? new Date().toISOString(),
        updated_at: p.updatedAt?.toISOString() ?? new Date().toISOString(),
      };
    });

    const response: PaginatedPatternsResponse = {
      patterns: patternItems,
      total,
      limit,
      offset,
    };

    // No caching for real-time data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.json(response);
  } catch (error) {
    console.error('Error fetching patterns:', error);
    res.status(500).json({
      error: 'Failed to fetch patterns',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
