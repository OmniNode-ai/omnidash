/**
 * OmniMemory domain handler [OMN-5191]
 *
 * Handles topics with the omnimemory prefix:
 * - Intent stored events
 * - Intent query response events
 */

import crypto from 'node:crypto';
import type { KafkaMessage } from 'kafkajs';
import {
  INTENT_STORED_TOPIC,
  isIntentStoredEvent,
  type IntentRecordPayload,
} from '@shared/intent-types';
import { getIntentEventEmitter } from '../../intent-events';
import { SUFFIX_MEMORY_INTENT_STORED, SUFFIX_MEMORY_INTENT_QUERY_RESPONSE } from '@shared/topics';
import type {
  DomainHandler,
  ConsumerContext,
  RawIntentStoredEvent,
  RawIntentQueryResponseEvent,
} from './types';
import { intentLogger, sanitizeTimestamp } from './consumer-utils';

/** All topic suffixes this handler responds to */
const HANDLED_TOPICS = new Set([SUFFIX_MEMORY_INTENT_STORED, SUFFIX_MEMORY_INTENT_QUERY_RESPONSE]);

// ============================================================================
// Handler Functions
// ============================================================================

function handleIntentStored(event: RawIntentStoredEvent, ctx: ConsumerContext): void {
  try {
    const intentEventId = event.id || crypto.randomUUID();
    const createdAt = sanitizeTimestamp(
      event.timestamp || event.created_at || event.createdAt,
      new Date()
    );

    ctx.emit('intent-event', {
      topic: INTENT_STORED_TOPIC,
      payload: {
        id: intentEventId,
        intentId: event.intent_id || event.intentId,
        intentType: event.intent_type || event.intentType,
        storageLocation: event.storage_location || event.storageLocation,
        correlationId: event.correlation_id || event.correlationId,
        createdAt,
      },
      timestamp: new Date().toISOString(),
    });

    ctx.emit('intentUpdate', {
      id: intentEventId,
      topic: INTENT_STORED_TOPIC,
      type: 'intent-stored',
      actionType: 'intent-stored',
      intentId: event.intent_id || event.intentId,
      intentType: event.intent_type || event.intentType,
      timestamp: new Date().toISOString(),
    });

    if (isIntentStoredEvent(event)) {
      const intentRecordPayload: IntentRecordPayload = {
        intent_id: event.intent_id,
        session_ref: event.session_ref,
        intent_category: event.intent_category,
        confidence: event.confidence,
        keywords: event.keywords || [],
        created_at: event.stored_at,
      };
      getIntentEventEmitter().emitIntentStored(intentRecordPayload);
      intentLogger.debug(
        `Forwarded intent stored to IntentEventEmitter: ${intentRecordPayload.intent_id}`
      );
    } else {
      const intentId = event.intent_id || event.intentId || crypto.randomUUID();
      const intentRecordPayload: IntentRecordPayload = {
        intent_id: intentId,
        session_ref: 'unknown',
        intent_category: event.intent_type || event.intentType || 'unknown',
        confidence: 0,
        keywords: [],
        created_at: createdAt.toISOString(),
      };
      getIntentEventEmitter().emitIntentStored(intentRecordPayload);
      intentLogger.debug(
        `Forwarded legacy intent stored to IntentEventEmitter: ${intentRecordPayload.intent_id}`
      );
    }

    intentLogger.info(`Processed intent stored: ${event.intent_id || event.intentId}`);
  } catch (error) {
    const errorContext = {
      eventId: event.id ?? 'unknown',
      intentId: event.intent_id ?? event.intentId ?? 'unknown',
      correlationId: event.correlation_id ?? event.correlationId ?? 'unknown',
      intentType: event.intent_type ?? event.intentType ?? 'unknown',
      storageLocation: event.storage_location ?? event.storageLocation ?? 'unknown',
      timestamp: event.timestamp ?? event.created_at ?? event.createdAt ?? 'unknown',
    };

    intentLogger.error(
      `Error processing intent stored event. Context: ${JSON.stringify(errorContext)}`,
      error
    );

    ctx.emit('error', {
      type: 'intent-stored-error',
      context: errorContext,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      originalError: error,
      timestamp: new Date().toISOString(),
    });
  }
}

function handleIntentQueryResponse(event: RawIntentQueryResponseEvent, ctx: ConsumerContext): void {
  try {
    const createdAt = sanitizeTimestamp(
      event.timestamp || event.created_at || event.createdAt,
      new Date()
    );

    ctx.emit('intent-query-response', {
      query_id: event.query_id || event.queryId,
      correlation_id: event.correlation_id || event.correlationId,
      payload: {
        queryId: event.query_id || event.queryId,
        correlationId: event.correlation_id || event.correlationId,
        results: event.results || [],
        totalCount: event.total_count || event.totalCount || 0,
        createdAt,
      },
    });

    intentLogger.info(`Processed intent query response: ${event.query_id || event.queryId}`);
  } catch (error) {
    const errorContext = {
      queryId: event.query_id ?? event.queryId ?? 'unknown',
      correlationId: event.correlation_id ?? event.correlationId ?? 'unknown',
      totalCount: event.total_count ?? event.totalCount ?? 'unknown',
      resultsCount: event.results?.length ?? 0,
      timestamp: event.timestamp ?? event.created_at ?? event.createdAt ?? 'unknown',
    };

    intentLogger.error(
      `Error processing intent query response. Context: ${JSON.stringify(errorContext)}`,
      error
    );

    ctx.emit('error', {
      type: 'intent-query-response-error',
      context: errorContext,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      originalError: error,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// DomainHandler Implementation
// ============================================================================

export class OmnimemoryHandler implements DomainHandler {
  readonly name = 'omnimemory';

  canHandle(topic: string): boolean {
    return HANDLED_TOPICS.has(topic);
  }

  handleEvent(
    topic: string,
    event: Record<string, unknown>,
    _message: KafkaMessage,
    ctx: ConsumerContext
  ): void {
    switch (topic) {
      case SUFFIX_MEMORY_INTENT_STORED:
        if (ctx.isDebug) {
          intentLogger.debug(`Processing intent stored: ${event.intent_id || event.intentId}`);
        }
        handleIntentStored(event as RawIntentStoredEvent, ctx);
        break;

      case SUFFIX_MEMORY_INTENT_QUERY_RESPONSE:
        if (ctx.isDebug) {
          intentLogger.debug(
            `Processing intent query response: ${event.query_id || event.queryId}`
          );
        }
        handleIntentQueryResponse(event as RawIntentQueryResponseEvent, ctx);
        break;
    }
  }
}
