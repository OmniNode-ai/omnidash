/**
 * Intent Classification Routes
 *
 * REST API endpoints for querying intent classification data.
 * Uses event-based queries via Kafka for real-time intent data.
 *
 * Part of OMN-1516: Intent Classification Dashboard
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getIntelligenceEvents } from './intelligence-event-adapter';
import {
  intentEventEmitter,
  emitIntentUpdate,
  emitIntentDistributionUpdate,
  type IntentRecord,
} from './intent-events';

export const intentRouter = Router();

// ============================================================================
// Type Definitions
// ============================================================================

interface DistributionResponse {
  distribution: Record<string, number>;
  total_intents: number;
  time_range_hours: number;
}

interface SessionIntentsResponse {
  intents: IntentRecord[];
  /** Number of intents returned in this response */
  count: number;
  /** Total intents available for this session (before limit applied) */
  total_available: number;
  session_ref: string;
}

interface RecentIntentsResponse {
  intents: IntentRecord[];
  /** Number of intents returned in this response */
  count: number;
  /** Total intents available (before limit applied) */
  total_available: number;
}

interface StoreIntentResponse {
  success: boolean;
  intent_id: string;
}

// Zod schema for POST /store request body validation
const StoreIntentSchema = z.object({
  sessionRef: z.string().max(255).optional(),
  intentCategory: z.string().min(1, 'intentCategory cannot be empty').max(100),
  confidence: z.number().min(0).max(1).optional().default(0.95),
  keywords: z.array(z.string().max(100)).max(50).optional().default([]),
});

// Zod schemas for query parameter validation
const DistributionQuerySchema = z.object({
  time_range_hours: z.coerce.number().int().min(1).max(168).optional().default(24),
});

const SessionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  min_confidence: z.coerce.number().min(0).max(1).optional().default(0),
});

const RecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
  offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
  time_range_hours: z.coerce.number().int().min(1).max(168).optional().default(24),
});

const StoreQuerySchema = z.object({
  emit_distribution: z.coerce.boolean().optional().default(true),
});

// ============================================================================
// In-Memory Store (Circular Buffer for O(1) insertion)
// ============================================================================

// Configurable via environment variable, default 10000
const MAX_STORED_INTENTS = parseInt(process.env.INTENT_STORE_MAX_SIZE || '10000', 10);

// Circular buffer implementation for O(1) insertion
// Instead of unshift() which is O(n), we use a fixed-size array with head tracking
const intentBuffer: (IntentRecord | null)[] = new Array(MAX_STORED_INTENTS).fill(null);
let bufferHead = 0; // Points to where the next item will be inserted
let bufferCount = 0; // Number of items currently in buffer

/**
 * Add intent to circular buffer with O(1) insertion time
 *
 * Performance: O(1) vs O(n) for unshift()
 * Memory: Fixed allocation of MAX_STORED_INTENTS slots
 */
function addToStore(intent: IntentRecord): void {
  intentBuffer[bufferHead] = intent;
  bufferHead = (bufferHead + 1) % MAX_STORED_INTENTS;
  if (bufferCount < MAX_STORED_INTENTS) {
    bufferCount++;
  }
}

/**
 * Get all intents from circular buffer in reverse chronological order (newest first)
 *
 * This maintains the same ordering as the previous unshift()-based implementation
 */
function getAllIntentsFromBuffer(): IntentRecord[] {
  if (bufferCount === 0) return [];

  const result: IntentRecord[] = [];
  // Start from the most recently added item (bufferHead - 1) and go backwards
  for (let i = 0; i < bufferCount; i++) {
    const index = (bufferHead - 1 - i + MAX_STORED_INTENTS) % MAX_STORED_INTENTS;
    // Defensive bounds check - should never trigger with correct modulo math,
    // but guards against future refactoring errors
    if (index < 0 || index >= MAX_STORED_INTENTS) {
      console.error(`[intent-routes] Buffer index out of bounds: ${index}`);
      continue;
    }
    const intent = intentBuffer[index];
    if (intent !== null) {
      result.push(intent);
    }
  }
  return result;
}

/**
 * Get intents from circular buffer filtered by time range
 */
function getIntentsFromStore(timeRangeHours: number): IntentRecord[] {
  const cutoff = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
  return getAllIntentsFromBuffer().filter((intent) => new Date(intent.createdAt) >= cutoff);
}

/**
 * Get intents from circular buffer filtered by session
 * Returns both the sliced intents and the total available count before limiting
 */
function getIntentsBySession(
  sessionRef: string,
  limit: number,
  minConfidence: number
): { intents: IntentRecord[]; totalAvailable: number } {
  const filtered = getAllIntentsFromBuffer().filter(
    (intent) => intent.sessionRef === sessionRef && intent.confidence >= minConfidence
  );
  return {
    intents: filtered.slice(0, limit),
    totalAvailable: filtered.length,
  };
}

// ============================================================================
// Rate Limiting for POST /store
// ============================================================================

const rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;
// Maximum number of unique IPs to track. Prevents unbounded memory growth under attack.
const RATE_LIMIT_MAX_IPS = parseInt(process.env.RATE_LIMIT_MAX_IPS || '10000', 10);

/**
 * Evict expired entries from the rate limit store.
 * Returns the number of entries removed.
 */
function evictExpiredRateLimitEntries(): number {
  const now = Date.now();
  let evictedCount = 0;
  rateLimitStore.forEach((entry, ip) => {
    if (now > entry.resetTime) {
      rateLimitStore.delete(ip);
      evictedCount++;
    }
  });
  return evictedCount;
}

/**
 * Evict the oldest (soonest-to-expire) entry from the rate limit store.
 * Used as a fallback when max size is reached and no expired entries exist.
 */
function evictOldestRateLimitEntry(): void {
  let oldestIp: string | null = null;
  let oldestResetTime = Infinity;

  rateLimitStore.forEach((entry, ip) => {
    if (entry.resetTime < oldestResetTime) {
      oldestResetTime = entry.resetTime;
      oldestIp = ip;
    }
  });

  if (oldestIp !== null) {
    rateLimitStore.delete(oldestIp);
  }
}

/**
 * Ensure the rate limit store does not exceed max size.
 * First clears expired entries, then evicts oldest if still at capacity.
 */
function enforceRateLimitStoreMaxSize(): void {
  if (rateLimitStore.size < RATE_LIMIT_MAX_IPS) {
    return;
  }

  // First, try to clear expired entries
  const evicted = evictExpiredRateLimitEntries();

  // If still at max capacity, evict oldest entries until under limit
  while (rateLimitStore.size >= RATE_LIMIT_MAX_IPS) {
    evictOldestRateLimitEntry();
  }
}

/**
 * Check if a request from the given IP is within rate limits.
 * Returns true if request is allowed, false if rate limit exceeded.
 *
 * Enforces max store size to prevent unbounded memory growth.
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    // New entry needed - enforce max size before adding
    if (!rateLimitStore.has(ip)) {
      enforceRateLimitStoreMaxSize();
    }
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Get remaining requests for an IP within the current window.
 */
function getRateLimitRemaining(ip: string): number {
  const entry = rateLimitStore.get(ip);
  if (!entry || Date.now() > entry.resetTime) {
    return RATE_LIMIT_MAX_REQUESTS;
  }
  return Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);
}

/**
 * Get time until rate limit resets for an IP (in seconds).
 */
function getRateLimitResetSeconds(ip: string): number {
  const entry = rateLimitStore.get(ip);
  if (!entry || Date.now() > entry.resetTime) {
    return Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
  }
  return Math.ceil(Math.max(0, entry.resetTime - Date.now()) / 1000);
}

// Singleton guard to prevent multiple cleanup intervals during hot-reload.
// In development with Vite HMR, module re-execution would otherwise create
// duplicate intervals. Using globalThis ensures the interval reference survives
// module replacement, preventing memory leaks and redundant cleanup operations.
const RATE_LIMIT_CLEANUP_KEY = '__omnidash_intent_rate_limit_cleanup_interval__';

// Clear any existing interval before setting a new one (handles HMR)
if ((globalThis as Record<string, unknown>)[RATE_LIMIT_CLEANUP_KEY]) {
  clearInterval((globalThis as Record<string, unknown>)[RATE_LIMIT_CLEANUP_KEY] as NodeJS.Timeout);
}

(globalThis as Record<string, unknown>)[RATE_LIMIT_CLEANUP_KEY] = setInterval(
  () => {
    const now = Date.now();
    rateLimitStore.forEach((entry, ip) => {
      if (now > entry.resetTime) {
        rateLimitStore.delete(ip);
      }
    });
  },
  5 * 60 * 1000
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate distribution from intent records
 */
function calculateDistribution(intents: IntentRecord[]): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const intent of intents) {
    const category = intent.intentCategory || 'unknown';
    distribution[category] = (distribution[category] || 0) + 1;
  }
  return distribution;
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/intents/distribution
 *
 * Returns category distribution counts for intents within the time range.
 *
 * Query parameters:
 * - time_range_hours: number (default: 24)
 *
 * Response:
 * {
 *   distribution: { [category]: count },
 *   total_intents: number,
 *   time_range_hours: number
 * }
 */
intentRouter.get('/distribution', async (req, res) => {
  try {
    const queryResult = DistributionQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: queryResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; '),
      });
    }
    const { time_range_hours: timeRangeHours } = queryResult.data;

    // Try to get data from Kafka/intelligence service
    const intelligenceEvents = getIntelligenceEvents();
    if (intelligenceEvents) {
      try {
        const result = await intelligenceEvents.request(
          'intent_distribution',
          {
            operation_type: 'INTENT_DISTRIBUTION',
            time_range_hours: timeRangeHours,
          },
          5000
        );

        if (result?.distribution) {
          const response: DistributionResponse = {
            distribution: result.distribution,
            total_intents: result.total_intents || 0,
            time_range_hours: timeRangeHours,
          };
          return res.json(response);
        }
      } catch (kafkaError) {
        if (process.env.DEBUG_INTENT_EVENTS === 'true') {
          console.warn(
            '[intent-routes] Kafka request failed, falling back to in-memory store:',
            kafkaError
          );
        }
      }
    }

    // Fallback: use in-memory store
    const intents = getIntentsFromStore(timeRangeHours);
    const distribution = calculateDistribution(intents);

    const response: DistributionResponse = {
      distribution,
      total_intents: intents.length,
      time_range_hours: timeRangeHours,
    };

    return res.json(response);
  } catch (error) {
    console.error('[intent-routes] Error fetching intent distribution:', error);
    return res.status(500).json({
      error: 'Failed to fetch intent distribution',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/intents/session/:sessionId
 *
 * Returns intents for a specific session.
 *
 * Path parameters:
 * - sessionId: string
 *
 * Query parameters:
 * - limit: number (default: 100)
 * - min_confidence: number (default: 0.0)
 *
 * Response:
 * {
 *   intents: IntentRecord[],
 *   count: number,           // Number of intents returned in this response
 *   total_available: number, // Total intents matching filters (before limit applied)
 *   session_ref: string
 * }
 */
intentRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Validate sessionId
    if (!sessionId || sessionId.length === 0 || sessionId.length > 255) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: 'sessionId must be between 1-255 characters',
      });
    }

    const queryResult = SessionQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: queryResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; '),
      });
    }
    const { limit, min_confidence: minConfidence } = queryResult.data;

    // Try to get data from Kafka/intelligence service
    const intelligenceEvents = getIntelligenceEvents();
    if (intelligenceEvents) {
      try {
        const result = await intelligenceEvents.request(
          'intent_session',
          {
            operation_type: 'INTENT_SESSION_QUERY',
            session_ref: sessionId,
            limit,
            min_confidence: minConfidence,
          },
          5000
        );

        if (result?.intents) {
          const response: SessionIntentsResponse = {
            intents: result.intents,
            count: result.intents.length,
            total_available: result.total_count || result.intents.length,
            session_ref: sessionId,
          };
          return res.json(response);
        }
      } catch (kafkaError) {
        if (process.env.DEBUG_INTENT_EVENTS === 'true') {
          console.warn(
            '[intent-routes] Kafka request failed, falling back to in-memory store:',
            kafkaError
          );
        }
      }
    }

    // Fallback: use in-memory store
    const { intents, totalAvailable } = getIntentsBySession(sessionId, limit, minConfidence);

    const response: SessionIntentsResponse = {
      intents,
      count: intents.length,
      total_available: totalAvailable,
      session_ref: sessionId,
    };

    return res.json(response);
  } catch (error) {
    console.error('[intent-routes] Error fetching session intents:', error);
    return res.status(500).json({
      error: 'Failed to fetch session intents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/intents/recent
 *
 * Returns recent intents across all sessions.
 *
 * Query parameters:
 * - limit: number (default: 50, max: 1000)
 * - offset: number (default: 0, max: 10000)
 * - time_range_hours: number (default: 24, max: 168)
 *
 * Response:
 * {
 *   intents: IntentRecord[],
 *   count: number,           // Number of intents returned in this response
 *   total_available: number  // Total intents in time range (before limit/offset applied)
 * }
 */
intentRouter.get('/recent', async (req, res) => {
  try {
    const queryResult = RecentQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: queryResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; '),
      });
    }
    const { limit, offset, time_range_hours: timeRangeHours } = queryResult.data;

    // Try to get data from Kafka/intelligence service
    const intelligenceEvents = getIntelligenceEvents();
    if (intelligenceEvents) {
      try {
        const result = await intelligenceEvents.request(
          'intent_recent',
          {
            operation_type: 'INTENT_RECENT_QUERY',
            limit,
            offset,
            time_range_hours: timeRangeHours,
          },
          5000
        );

        if (result?.intents) {
          // NOTE: Kafka service owns pagination - it applies offset/limit upstream.
          // We trust the response is already paginated; do not slice again here.
          const response: RecentIntentsResponse = {
            intents: result.intents,
            count: result.intents.length,
            total_available: result.total_count || result.intents.length,
          };
          return res.json(response);
        }
      } catch (kafkaError) {
        if (process.env.DEBUG_INTENT_EVENTS === 'true') {
          console.warn(
            '[intent-routes] Kafka request failed, falling back to in-memory store:',
            kafkaError
          );
        }
      }
    }

    // Fallback: use in-memory store
    const allIntentsInRange = getIntentsFromStore(timeRangeHours);
    const intents = allIntentsInRange.slice(offset, offset + limit);

    const response: RecentIntentsResponse = {
      intents,
      count: intents.length,
      total_available: allIntentsInRange.length,
    };

    return res.json(response);
  } catch (error) {
    console.error('[intent-routes] Error fetching recent intents:', error);
    return res.status(500).json({
      error: 'Failed to fetch recent intents',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/intents/store
 *
 * Store intent data for manual testing.
 * Emits to WebSocket subscribers for real-time updates.
 *
 * Query parameters:
 * - emit_distribution: boolean (default: true) - Whether to emit distribution update via WebSocket.
 *   Set to false for high-volume scenarios to reduce WebSocket traffic.
 *
 * Request body:
 * {
 *   sessionRef?: string,
 *   intentCategory: string,
 *   confidence?: number,
 *   keywords?: string[]
 * }
 *
 * Response:
 * {
 *   success: true,
 *   intent_id: string
 * }
 */
intentRouter.post('/store', async (req, res) => {
  try {
    // Rate limiting check
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      const remaining = getRateLimitRemaining(clientIp);
      const resetSeconds = getRateLimitResetSeconds(clientIp);
      res.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
      res.set('X-RateLimit-Remaining', String(remaining));
      res.set('X-RateLimit-Reset', String(resetSeconds));
      res.set('Retry-After', String(resetSeconds));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} requests per minute.`,
        retryAfterSeconds: resetSeconds,
      });
    }

    // Validate request body with Zod
    const parseResult = StoreIntentSchema.safeParse(req.body);

    if (!parseResult.success) {
      const errorMessages = parseResult.error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      return res.status(400).json({
        error: 'Validation failed',
        message: errorMessages.join('; '),
        details: parseResult.error.errors,
      });
    }

    const { sessionRef, intentCategory, confidence, keywords } = parseResult.data;

    // Validate query parameters
    const queryResult = StoreQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: queryResult.error.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join('; '),
      });
    }
    const { emit_distribution: emitDistribution } = queryResult.data;

    // Create the intent record
    const intent: IntentRecord = {
      intentId: randomUUID(),
      sessionRef: sessionRef || `session-${randomUUID().slice(0, 8)}`,
      intentCategory,
      confidence,
      keywords,
      createdAt: new Date().toISOString(),
    };

    // Store in memory
    addToStore(intent);

    // Emit to WebSocket subscribers
    emitIntentUpdate(intent);

    // Conditionally emit updated distribution (can be disabled for high-volume scenarios)
    if (emitDistribution) {
      const recentIntents = getIntentsFromStore(24);
      const distribution = calculateDistribution(recentIntents);
      emitIntentDistributionUpdate({
        distribution,
        total_intents: recentIntents.length,
        time_range_hours: 24,
      });
    }

    const response: StoreIntentResponse = {
      success: true,
      intent_id: intent.intentId,
    };

    // Add rate limit headers to all responses (not just 429)
    res.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    res.set('X-RateLimit-Remaining', String(getRateLimitRemaining(clientIp)));
    res.set('X-RateLimit-Reset', String(getRateLimitResetSeconds(clientIp)));

    return res.status(201).json(response);
  } catch (error) {
    console.error('[intent-routes] Error storing intent:', error);
    return res.status(500).json({
      error: 'Failed to store intent',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Test Exports (for unit testing internal functions)
// ============================================================================

/**
 * Reset circular buffer state (for testing purposes only)
 */
function resetBuffer(): void {
  intentBuffer.fill(null);
  bufferHead = 0;
  bufferCount = 0;
}

/**
 * Reset rate limit store (for testing purposes only)
 */
function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Get current buffer state (for testing/debugging purposes)
 */
function getBufferState(): { head: number; count: number; maxSize: number } {
  return { head: bufferHead, count: bufferCount, maxSize: MAX_STORED_INTENTS };
}

/**
 * Get current rate limit store size (for testing/debugging purposes)
 */
function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

// Export internal functions for testing
// These are prefixed with underscore to indicate they are internal/test-only
export const _testHelpers = {
  // Buffer functions
  addToStore,
  getAllIntentsFromBuffer,
  getIntentsFromStore,
  getIntentsBySession,
  resetBuffer,
  getBufferState,
  // Rate limit functions
  checkRateLimit,
  getRateLimitRemaining,
  getRateLimitResetSeconds,
  resetRateLimitStore,
  getRateLimitStoreSize,
  // Constants
  MAX_STORED_INTENTS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_IPS,
};
