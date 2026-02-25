/**
 * Intent Routes
 *
 * REST API endpoints for the Intent Dashboard (/intents).
 * Manages a circular in-memory buffer of IntentRecord objects,
 * provides time-range and session-based queries, and enforces
 * per-IP rate limiting on all endpoints.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { IntentRecord, IntentRecordPayload } from './intent-events';
import { toSnakeCase } from './intent-events';

// ============================================================================
// Constants
// ============================================================================

const _rawMaxStoredIntents = parseInt(process.env.MAX_STORED_INTENTS ?? '', 10);
export const MAX_STORED_INTENTS =
  isNaN(_rawMaxStoredIntents) || _rawMaxStoredIntents <= 0 ? 1000 : _rawMaxStoredIntents;

const _rawRateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '', 10);
export const RATE_LIMIT_WINDOW_MS =
  isNaN(_rawRateLimitWindowMs) || _rawRateLimitWindowMs <= 0 ? 60000 : _rawRateLimitWindowMs;

const _rawRateLimitMaxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '', 10);
export const RATE_LIMIT_MAX_REQUESTS =
  isNaN(_rawRateLimitMaxRequests) || _rawRateLimitMaxRequests <= 0 ? 100 : _rawRateLimitMaxRequests;

// ============================================================================
// Time Range Constants (OMN-1561)
//
// The intent API endpoints have intentionally different time-range behaviours:
//
//   GET /recent       — time-range is NOT a query parameter. The endpoint
//                       always returns the newest N items from the in-memory
//                       circular buffer regardless of age. The response
//                       includes `time_range_hours: 24` as a documentation
//                       hint only (indicates the typical freshness window for
//                       a live dashboard). Callers should not use this field
//                       for filtering decisions.
//
//   GET /distribution — time-range IS a query parameter. The endpoint filters
//                       the circular buffer by `created_at` and is designed
//                       for trend / historical analysis over configurable
//                       windows. The soft-recommended maximum is documented
//                       by DISTRIBUTION_MAX_TIME_RANGE_HOURS below; values
//                       beyond this are accepted but may return sparse results
//                       since the in-memory buffer only retains MAX_STORED_INTENTS
//                       entries and older data will have been evicted.
//
// This asymmetry is intentional:
//   - /recent  → real-time stream (show latest activity, no age filter)
//   - /distribution → trend analysis (configurable historical window)
//
// If strict alignment is ever required, both endpoints should cap their
// time_range_hours using DISTRIBUTION_MAX_TIME_RANGE_HOURS.
// ============================================================================

/**
 * Soft-recommended maximum hours for the time_range_hours query parameter on
 * GET /api/intents/distribution. Values beyond this are accepted but will
 * typically return sparse data because the circular buffer only retains
 * MAX_STORED_INTENTS entries; older intents will have been evicted.
 *
 * Default: 168 hours (7 days)
 */
const _rawDistributionMaxTimeRangeHours = parseInt(
  process.env.DISTRIBUTION_MAX_TIME_RANGE_HOURS ?? '',
  10
);
export const DISTRIBUTION_MAX_TIME_RANGE_HOURS =
  isNaN(_rawDistributionMaxTimeRangeHours) || _rawDistributionMaxTimeRangeHours <= 0
    ? 168
    : _rawDistributionMaxTimeRangeHours;

// ============================================================================
// Circular Buffer
// ============================================================================

const intentBuffer: (IntentRecord | undefined)[] = new Array(MAX_STORED_INTENTS).fill(undefined);
let bufferHead = 0;
let bufferCount = 0;

function addToStore(intent: IntentRecord): void {
  intentBuffer[bufferHead] = intent;
  bufferHead = (bufferHead + 1) % MAX_STORED_INTENTS;
  if (bufferCount < MAX_STORED_INTENTS) {
    bufferCount++;
  }
}

function getBufferState(): { count: number; head: number } {
  return { count: bufferCount, head: bufferHead };
}

function getAllIntentsFromBuffer(): IntentRecord[] {
  if (bufferCount === 0) return [];
  const result: IntentRecord[] = [];
  for (let i = 0; i < bufferCount; i++) {
    const idx = (bufferHead - 1 - i + MAX_STORED_INTENTS) % MAX_STORED_INTENTS;
    const item = intentBuffer[idx];
    if (item !== undefined) {
      result.push(item);
    }
  }
  return result;
}

function getIntentsFromStore(timeRangeHours: number): IntentRecord[] {
  const cutoff = Date.now() - timeRangeHours * 60 * 60 * 1000;
  return getAllIntentsFromBuffer().filter(
    (intent) => new Date(intent.createdAt).getTime() >= cutoff
  );
}

function getIntentsBySession(
  sessionRef: string,
  limit: number,
  minConfidence: number
): { intents: IntentRecord[]; totalAvailable: number } {
  const matching = getAllIntentsFromBuffer().filter(
    (intent) => intent.sessionRef === sessionRef && intent.confidence >= minConfidence
  );
  return {
    intents: matching.slice(0, limit),
    totalAvailable: matching.length,
  };
}

function resetBuffer(): void {
  intentBuffer.fill(undefined);
  bufferHead = 0;
  bufferCount = 0;
}

// ============================================================================
// Rate Limiting
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const MAX_RATE_LIMIT_STORE_SIZE = 10000;

const rateLimitStore = new Map<string, RateLimitEntry>();

const rateLimitEvictionInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetTime) rateLimitStore.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function pruneRateLimitStore(): void {
  if (rateLimitStore.size <= MAX_RATE_LIMIT_STORE_SIZE) return;
  // Sort all entries by resetTime and remove the oldest 20%
  const entries = Array.from(rateLimitStore.entries()).sort(
    ([, a], [, b]) => a.resetTime - b.resetTime
  );
  const pruneCount = Math.ceil(MAX_RATE_LIMIT_STORE_SIZE * 0.2);
  for (let i = 0; i < pruneCount && i < entries.length; i++) {
    rateLimitStore.delete(entries[i][0]);
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    pruneRateLimitStore();
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

function getRateLimitRemaining(ip: string): number {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    return RATE_LIMIT_MAX_REQUESTS;
  }

  return Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);
}

function getRateLimitResetSeconds(ip: string): number {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    return Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
  }

  return Math.ceil((entry.resetTime - now) / 1000);
}

function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

function resetRateLimitStore(): void {
  rateLimitStore.clear();
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

function gracefulShutdown(): void {
  clearInterval(rateLimitEvictionInterval);
  rateLimitStore.clear();
}

// Register SIGTERM handler so the module cleans up its interval and store.
// server/index.ts owns the primary process.exit(); we only clear module state here.
process.on('SIGTERM', () => {
  gracefulShutdown();
});

// ============================================================================
// Rate Limit Middleware
// ============================================================================

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  // All unidentifiable clients share one rate-limit bucket
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  if (!checkRateLimit(ip)) {
    const resetSecs = getRateLimitResetSeconds(ip);
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', resetSecs);
    res.status(429).json({
      ok: false,
      error: 'Rate limit exceeded',
      retry_after_seconds: resetSecs,
    });
    return;
  }

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', getRateLimitRemaining(ip));
  res.setHeader('X-RateLimit-Reset', getRateLimitResetSeconds(ip));
  next();
}

// ============================================================================
// Express Router
// ============================================================================

const router = Router();
router.use(rateLimitMiddleware);

/**
 * POST /api/intents
 * Store a new intent record in the circular buffer.
 */
router.post('/', (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const intent = req.body as IntentRecord;

    // Validate all required fields are present and well-typed
    const missingFields: string[] = [];
    if (typeof intent?.intentId !== 'string' || intent.intentId === '') {
      missingFields.push('intentId');
    }
    if (typeof intent?.intentCategory !== 'string' || intent.intentCategory === '') {
      missingFields.push('intentCategory');
    }
    if (typeof intent?.sessionRef !== 'string' || intent.sessionRef === '') {
      missingFields.push('sessionRef');
    }
    if (
      typeof intent?.confidence !== 'number' ||
      !isFinite(intent.confidence) ||
      intent.confidence < 0 ||
      intent.confidence > 1
    ) {
      missingFields.push('confidence');
    }
    if (typeof intent?.createdAt !== 'string' || isNaN(Date.parse(intent.createdAt))) {
      missingFields.push('createdAt');
    }
    if (missingFields.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    if (intent.keywords !== undefined && !Array.isArray(intent.keywords)) {
      return res.status(400).json({ ok: false, error: 'keywords must be an array' });
    }
    addToStore(intent);
    return res.json({
      ok: true,
      intentId: intent.intentId,
      execution_time_ms: Date.now() - start,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

/**
 * GET /api/intents/recent?limit=N
 * Returns the most recent intents, newest first (default 50, max 500).
 *
 * **Time range behaviour**: This endpoint does NOT filter by age. It always
 * returns the newest N items from the in-memory circular buffer regardless of
 * how old they are. The `time_range_hours` field in the response is a
 * documentation hint (24 hours = typical live-dashboard freshness window)
 * and should not be used for client-side filtering decisions.
 *
 * To filter by age, use GET /api/intents/distribution?time_range_hours=N
 * which applies a time-range filter on the buffer.
 *
 * @param limit - Max items to return (default 50, hard-capped at 500)
 */
router.get('/recent', (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const rawLimit = parseInt(String(_req.query.limit ?? '50'), 10);
    if (isNaN(rawLimit) || rawLimit <= 0) {
      return res.status(400).json({ error: 'Invalid limit' });
    }
    const limit = Math.min(rawLimit, 500);
    const all = getAllIntentsFromBuffer();
    const intents: IntentRecordPayload[] = all.slice(0, limit).map(toSnakeCase);
    return res.json({
      ok: true,
      intents,
      total_count: all.length,
      // time_range_hours is a documentation hint only — /recent does not filter by age.
      // It reflects the typical live-dashboard freshness window (24 h).
      time_range_hours: 24,
      execution_time_ms: Date.now() - start,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err), intents: [], total_count: 0 });
  }
});

/**
 * GET /api/intents/distribution?time_range_hours=N
 * Returns intent category counts for the given time range (default 24 hours).
 *
 * **Time range behaviour**: This endpoint DOES filter the in-memory circular
 * buffer by `created_at >= now - time_range_hours`. It is designed for
 * trend analysis and supports a configurable historical window.
 *
 * The soft-recommended maximum is DISTRIBUTION_MAX_TIME_RANGE_HOURS (default 168h / 7 days).
 * Values beyond this are accepted but may return sparse results because the
 * circular buffer only retains MAX_STORED_INTENTS entries — intents older than
 * the buffer's capacity will have been evicted.
 *
 * Unlike GET /api/intents/recent, which shows the latest N items regardless of age,
 * this endpoint applies a strict cutoff so callers can query historical windows.
 *
 * @param time_range_hours - Hours to look back (default 24, must be > 0 and finite;
 *   soft max: DISTRIBUTION_MAX_TIME_RANGE_HOURS = 168)
 */
router.get('/distribution', (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const timeRangeHours = parseFloat(String(_req.query.time_range_hours ?? '24'));
    if (isNaN(timeRangeHours) || timeRangeHours <= 0 || !isFinite(timeRangeHours)) {
      return res.status(400).json({ error: 'Invalid time_range_hours' });
    }
    const intents = getIntentsFromStore(timeRangeHours);
    const distribution: Record<string, number> = {};
    for (const intent of intents) {
      distribution[intent.intentCategory] = (distribution[intent.intentCategory] ?? 0) + 1;
    }
    return res.json({
      ok: true,
      distribution,
      total_intents: intents.length,
      time_range_hours: timeRangeHours,
      execution_time_ms: Date.now() - start,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err),
      distribution: {},
      total_intents: 0,
      time_range_hours: 24,
    });
  }
});

/**
 * GET /api/intents/session/:sessionId?limit=N&min_confidence=0
 * Returns intents for a specific session, newest first.
 */
router.get('/session/:sessionId', (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const sessionId = decodeURIComponent(req.params.sessionId);
    const rawLimit = parseInt(String(req.query.limit ?? '100'), 10);
    if (isNaN(rawLimit) || rawLimit <= 0) {
      return res.status(400).json({ error: 'Invalid limit' });
    }
    const limit = Math.min(rawLimit, 500);
    const minConfidence = parseFloat(String(req.query.min_confidence ?? '0'));
    if (isNaN(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      return res.status(400).json({ error: 'Invalid min_confidence: must be 0–1' });
    }
    const { intents, totalAvailable } = getIntentsBySession(sessionId, limit, minConfidence);
    const payload: IntentRecordPayload[] = intents.map(toSnakeCase);
    return res.json({
      ok: true,
      intents: payload,
      total_count: totalAvailable,
      session_ref: sessionId,
      execution_time_ms: Date.now() - start,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err), intents: [], total_count: 0 });
  }
});

export default router;

// ============================================================================
// Test Helpers (exported for unit tests only — do not use in production code)
// ============================================================================

export const _testHelpers = {
  // Constants
  MAX_STORED_INTENTS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  DISTRIBUTION_MAX_TIME_RANGE_HOURS,

  // Buffer operations
  addToStore,
  getBufferState,
  getAllIntentsFromBuffer,
  getIntentsFromStore,
  getIntentsBySession,
  resetBuffer,

  // Rate limit operations
  checkRateLimit,
  getRateLimitRemaining,
  getRateLimitResetSeconds,
  getRateLimitStoreSize,
  resetRateLimitStore,
};
