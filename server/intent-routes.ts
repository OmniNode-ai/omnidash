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

export const MAX_STORED_INTENTS = parseInt(process.env.MAX_STORED_INTENTS ?? '10000', 10);
export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10);

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

const rateLimitStore = new Map<string, RateLimitEntry>();

const rateLimitEvictionInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetTime) rateLimitStore.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
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
// Rate Limit Middleware
// ============================================================================

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip =
    req.ip ?? req.socket?.remoteAddress ?? `unknown-${Math.random().toString(36).slice(2)}`;

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
    if (!intent?.intentId || !intent?.intentCategory) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }
    const MAX_TEXT_LENGTH = 2000;
    if (
      intent.raw_text &&
      typeof intent.raw_text === 'string' &&
      intent.raw_text.length > MAX_TEXT_LENGTH
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error: `raw_text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
        });
    }
    if (
      intent.user_context &&
      typeof intent.user_context === 'string' &&
      intent.user_context.length > MAX_TEXT_LENGTH
    ) {
      return res
        .status(400)
        .json({
          ok: false,
          error: `user_context exceeds maximum length of ${MAX_TEXT_LENGTH} characters`,
        });
    }
    if (intent.confidence !== undefined) {
      if (
        typeof intent.confidence !== 'number' ||
        !isFinite(intent.confidence) ||
        intent.confidence < 0 ||
        intent.confidence > 1
      ) {
        return res
          .status(400)
          .json({ ok: false, error: 'confidence must be a finite number between 0 and 1' });
      }
    }
    if (intent.createdAt !== undefined) {
      if (isNaN(Date.parse(String(intent.createdAt)))) {
        return res.status(400).json({ ok: false, error: 'createdAt must be a valid date string' });
      }
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
 */
router.get('/recent', (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const rawLimit = parseInt(String(_req.query.limit ?? '50'), 10);
    const limit = Math.min(isNaN(rawLimit) ? 50 : rawLimit, 500);
    const all = getAllIntentsFromBuffer();
    const intents: IntentRecordPayload[] = all.slice(0, limit).map(toSnakeCase);
    return res.json({
      ok: true,
      intents,
      total_count: all.length,
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
 */
router.get('/distribution', (_req: Request, res: Response) => {
  const start = Date.now();
  try {
    const timeRangeHours = parseFloat(String(_req.query.time_range_hours ?? '24'));
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
    const limit = Math.min(isNaN(rawLimit) ? 100 : rawLimit, 500);
    const minConfidence = parseFloat(String(req.query.min_confidence ?? '0'));
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
