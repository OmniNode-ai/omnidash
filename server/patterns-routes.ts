import { Router } from 'express';
import { z } from 'zod';
import { queryPatterns, VALID_STATUSES } from './pattern-queries';
import type { PaginatedPatternsResponse } from '@shared/intelligence-schema';

const router = Router();

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
    const queryResult = PatternsQuerySchema.safeParse(req.query);

    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const { status, min_confidence, limit, offset } = queryResult.data;

    const result = await queryPatterns({ status, min_confidence, limit, offset });

    // Graceful degradation: database not configured
    if (result === null) {
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

    // No caching for real-time data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching patterns:', error);
    res.status(500).json({
      error: 'Failed to fetch patterns',
      message: 'Internal server error',
    });
  }
});

export default router;
