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
  total_count: number;
  session_ref: string;
}

interface RecentIntentsResponse {
  intents: IntentRecord[];
  total_count: number;
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

// ============================================================================
// In-Memory Store (for development/testing)
// ============================================================================

// In-memory storage for intents when Kafka is not available
const intentStore: IntentRecord[] = [];
const MAX_STORED_INTENTS = 10000;

/**
 * Add intent to in-memory store with size limit
 */
function addToStore(intent: IntentRecord): void {
  intentStore.unshift(intent);
  if (intentStore.length > MAX_STORED_INTENTS) {
    intentStore.pop();
  }
}

/**
 * Get intents from in-memory store filtered by time range
 */
function getIntentsFromStore(timeRangeHours: number): IntentRecord[] {
  const cutoff = new Date(Date.now() - timeRangeHours * 60 * 60 * 1000);
  return intentStore.filter((intent) => new Date(intent.createdAt) >= cutoff);
}

/**
 * Get intents from in-memory store filtered by session
 */
function getIntentsBySession(
  sessionRef: string,
  limit: number,
  minConfidence: number
): IntentRecord[] {
  return intentStore
    .filter((intent) => intent.sessionRef === sessionRef && intent.confidence >= minConfidence)
    .slice(0, limit);
}

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
    const timeRangeHours = parseInt(req.query.time_range_hours as string) || 24;

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
        console.warn(
          '[intent-routes] Kafka request failed, falling back to in-memory store:',
          kafkaError
        );
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
 *   total_count: number,
 *   session_ref: string
 * }
 */
intentRouter.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const minConfidence = parseFloat(req.query.min_confidence as string) || 0.0;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing required parameter',
        message: 'sessionId is required',
      });
    }

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
            total_count: result.total_count || result.intents.length,
            session_ref: sessionId,
          };
          return res.json(response);
        }
      } catch (kafkaError) {
        console.warn(
          '[intent-routes] Kafka request failed, falling back to in-memory store:',
          kafkaError
        );
      }
    }

    // Fallback: use in-memory store
    const intents = getIntentsBySession(sessionId, limit, minConfidence);

    const response: SessionIntentsResponse = {
      intents,
      total_count: intents.length,
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
 * - limit: number (default: 50)
 * - time_range_hours: number (default: 24)
 *
 * Response:
 * {
 *   intents: IntentRecord[],
 *   total_count: number
 * }
 */
intentRouter.get('/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 1000);
    const timeRangeHours = parseInt(req.query.time_range_hours as string) || 24;

    // Try to get data from Kafka/intelligence service
    const intelligenceEvents = getIntelligenceEvents();
    if (intelligenceEvents) {
      try {
        const result = await intelligenceEvents.request(
          'intent_recent',
          {
            operation_type: 'INTENT_RECENT_QUERY',
            limit,
            time_range_hours: timeRangeHours,
          },
          5000
        );

        if (result?.intents) {
          const response: RecentIntentsResponse = {
            intents: result.intents.slice(0, limit),
            total_count: result.total_count || result.intents.length,
          };
          return res.json(response);
        }
      } catch (kafkaError) {
        console.warn(
          '[intent-routes] Kafka request failed, falling back to in-memory store:',
          kafkaError
        );
      }
    }

    // Fallback: use in-memory store
    const intents = getIntentsFromStore(timeRangeHours).slice(0, limit);

    const response: RecentIntentsResponse = {
      intents,
      total_count: intents.length,
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

    // Also emit updated distribution
    const recentIntents = getIntentsFromStore(24);
    const distribution = calculateDistribution(recentIntents);
    emitIntentDistributionUpdate({
      distribution,
      total_intents: recentIntents.length,
      time_range_hours: 24,
    });

    const response: StoreIntentResponse = {
      success: true,
      intent_id: intent.intentId,
    };

    return res.status(201).json(response);
  } catch (error) {
    console.error('[intent-routes] Error storing intent:', error);
    return res.status(500).json({
      error: 'Failed to store intent',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
