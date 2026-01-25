/**
 * Intent Query API Routes for omnidash.
 *
 * Provides HTTP endpoints for querying intent classification data:
 * - GET /api/intents/distribution - Get intent category counts
 * - GET /api/intents/session/:sessionId - Get intents for a session
 * - GET /api/intents/recent - Get recent intents
 *
 * These endpoints query via events (not direct Memgraph) to maintain
 * the event-driven architecture. Part of demo critical path.
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { intentEventEmitter } from './intent-events';
import { getIntelligenceEvents, IntelligenceEventAdapter } from './intelligence-event-adapter';

export const intentRouter = Router();

// ============================================================================
// Constants: Valid Intent Categories
// ============================================================================

/**
 * Valid intent categories for validation.
 * Must match the categories defined in client/src/lib/intent-colors.ts
 */
const VALID_INTENT_CATEGORIES = [
  'debugging',
  'code_generation',
  'refactoring',
  'testing',
  'documentation',
  'analysis',
  'pattern_learning',
  'quality_assessment',
  'semantic_analysis',
  'deployment',
  'configuration',
  'question',
  'unknown',
] as const;

/**
 * Validates that a category is a known intent category.
 * Comparison is case-insensitive.
 */
function isValidIntentCategory(category: string): boolean {
  return VALID_INTENT_CATEGORIES.includes(
    category.toLowerCase() as (typeof VALID_INTENT_CATEGORIES)[number]
  );
}

// ============================================================================
// Helper: Validate sessionId format
// ============================================================================

/**
 * Validate sessionId format.
 * Accepts UUIDs and alphanumeric strings with hyphens/underscores (max 128 chars)
 */
function isValidSessionId(sessionId: string): boolean {
  // Allow UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // Or alphanumeric with hyphens/underscores, max 128 chars
  const sessionIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;
  return sessionIdPattern.test(sessionId);
}

// ============================================================================
// Helper: Get intelligence events adapter (with lazy init)
// ============================================================================

async function getIntentAdapter(): Promise<IntelligenceEventAdapter | null> {
  const intel = getIntelligenceEvents();
  if (!intel) {
    return null;
  }
  if (!intel.started) {
    await intel.start();
  }
  return intel;
}

// ============================================================================
// GET /api/intents/distribution
// Returns intent category counts for a time range
// ============================================================================

intentRouter.get('/distribution', async (req, res) => {
  try {
    const timeRangeHours = Math.max(
      1,
      Math.min(720, parseInt(req.query.time_range_hours as string, 10) || 24)
    );
    const timeoutMs = Math.max(
      1000,
      Math.min(30000, parseInt(req.query.timeout as string, 10) || 5000)
    );

    const intel = await getIntentAdapter();
    if (!intel) {
      return res.status(503).json({
        ok: false,
        error: 'Intent service unavailable',
        reason: 'Event adapter not configured',
      });
    }

    // Request via Kafka (event-driven, not direct DB)
    const correlationId = randomUUID();
    const result = await intel.request(
      'intent_query_distribution',
      {
        operation_type: 'INTENT_DISTRIBUTION',
        time_range_hours: timeRangeHours,
        correlation_id: correlationId,
      },
      timeoutMs
    );

    // Emit to WebSocket subscribers
    intentEventEmitter.emitDistributionUpdate({
      distribution: result.distribution || {},
      total_intents: result.total_intents || 0,
      time_range_hours: timeRangeHours,
    });

    return res.json({
      ok: true,
      distribution: result.distribution || {},
      total_intents: result.total_intents || 0,
      time_range_hours: timeRangeHours,
      execution_time_ms: result.execution_time_ms,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error querying intent distribution:', err);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
});

// ============================================================================
// GET /api/intents/session/:sessionId
// Returns intents for a specific session
// ============================================================================

intentRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: 'sessionId is required',
      });
    }

    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({
        ok: false,
        error:
          'Invalid sessionId format. Must be alphanumeric with hyphens/underscores, max 128 characters.',
      });
    }

    const minConfidence = Math.max(
      0,
      Math.min(1, parseFloat(req.query.min_confidence as string) || 0)
    );
    const limit = Math.max(1, Math.min(1000, parseInt(req.query.limit as string, 10) || 100));
    const timeoutMs = Math.max(
      1000,
      Math.min(30000, parseInt(req.query.timeout as string, 10) || 5000)
    );

    const intel = await getIntentAdapter();
    if (!intel) {
      return res.status(503).json({
        ok: false,
        error: 'Intent service unavailable',
      });
    }

    const correlationId = randomUUID();
    const result = await intel.request(
      'intent_query_session',
      {
        operation_type: 'INTENT_SESSION',
        session_id: sessionId,
        min_confidence: minConfidence,
        limit,
        correlation_id: correlationId,
      },
      timeoutMs
    );

    return res.json({
      ok: true,
      session_id: sessionId,
      intents: result.intents || [],
      total_count: result.total_count || 0,
      execution_time_ms: result.execution_time_ms,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error querying session intents:', err);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
});

// ============================================================================
// GET /api/intents/recent
// Returns recent intents across all sessions
// ============================================================================

intentRouter.get('/recent', async (req, res) => {
  try {
    const timeRangeHours = Math.max(
      1,
      Math.min(24, parseInt(req.query.time_range_hours as string, 10) || 1)
    );
    const minConfidence = Math.max(
      0,
      Math.min(1, parseFloat(req.query.min_confidence as string) || 0)
    );
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 50));
    const timeoutMs = Math.max(
      1000,
      Math.min(30000, parseInt(req.query.timeout as string, 10) || 5000)
    );

    const intel = await getIntentAdapter();
    if (!intel) {
      return res.status(503).json({
        ok: false,
        error: 'Intent service unavailable',
      });
    }

    const correlationId = randomUUID();
    const result = await intel.request(
      'intent_query_recent',
      {
        operation_type: 'INTENT_RECENT',
        time_range_hours: timeRangeHours,
        min_confidence: minConfidence,
        limit,
        correlation_id: correlationId,
      },
      timeoutMs
    );

    return res.json({
      ok: true,
      intents: result.intents || [],
      total_count: result.total_count || 0,
      time_range_hours: timeRangeHours,
      execution_time_ms: result.execution_time_ms,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error querying recent intents:', err);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
});

// ============================================================================
// POST /api/intents/store (for testing/manual intent storage)
// ============================================================================

intentRouter.post('/store', async (req, res) => {
  try {
    const { session_id, intent_category, confidence, keywords, user_context } = req.body;

    if (!session_id || !intent_category) {
      return res.status(400).json({
        ok: false,
        error: 'session_id and intent_category are required',
      });
    }

    if (!isValidSessionId(session_id)) {
      return res.status(400).json({
        ok: false,
        error:
          'Invalid session_id format. Must be alphanumeric with hyphens/underscores, max 128 characters.',
      });
    }

    if (!isValidIntentCategory(intent_category)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid intent_category. Must be one of: ${VALID_INTENT_CATEGORIES.join(', ')}`,
      });
    }

    const intel = await getIntentAdapter();
    if (!intel) {
      return res.status(503).json({
        ok: false,
        error: 'Intent service unavailable',
      });
    }

    const correlationId = randomUUID();
    const result = await intel.request(
      'intent_store',
      {
        operation_type: 'INTENT_STORE',
        session_id,
        intent_category,
        confidence: confidence || 0.5,
        keywords: keywords || [],
        user_context: user_context || '',
        correlation_id: correlationId,
      },
      5000
    );

    // Emit real-time event
    if (result.success) {
      intentEventEmitter.emitIntentStored({
        intent_id: result.intent_id,
        session_id,
        intent_category,
        confidence: confidence || 0.5,
        keywords: keywords || [],
        correlation_id: correlationId,
      });
    }

    return res.json({
      ok: result.success,
      intent_id: result.intent_id,
      session_id,
      created: result.created,
      execution_time_ms: result.execution_time_ms,
      error: result.error,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error storing intent:', err);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  }
});
