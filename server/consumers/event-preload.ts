/**
 * Event preload, playback injection, and live event buffer [OMN-5191]
 *
 * Extracted from event-consumer.ts to reduce orchestrator size.
 * These functions handle:
 *   - Capturing live Kafka events into an in-memory ring buffer
 *   - Preloading historical events from PostgreSQL on startup
 *   - Injecting playback events into domain handlers
 */

import crypto from 'node:crypto';
import type { KafkaMessage } from 'kafkajs';
import { sql } from 'drizzle-orm';
import { getIntelligenceDb } from '../storage';
import { extractSuffix } from '@shared/topics';
import { extractEventTimeMs } from '../monotonic-merge';
import type { EventBusEvent } from '../event-bus-data-source';
import { intentLogger, currentLogLevel } from './domain/consumer-utils';
import type { DomainHandler, ConsumerContext } from './domain/types';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

// ============================================================================
// Live Event Buffer
// ============================================================================

const MAX_LIVE_EVENT_BUS_EVENTS = 2000;

export function captureLiveEventBusEvent(
  liveBuffer: EventBusEvent[],
  event: Record<string, unknown>,
  rawTopic: string,
  partition: number,
  message: KafkaMessage
): void {
  try {
    const now = new Date();
    const eventTimeMs = extractEventTimeMs(event);
    const eventTimestamp =
      eventTimeMs > 0 ? new Date(eventTimeMs).toISOString() : now.toISOString();
    const parsedPayload =
      event.payload && typeof event.payload === 'object'
        ? (event.payload as Record<string, any>)
        : (event as Record<string, any>);
    liveBuffer.push({
      event_type: (event.event_type as string) || (event.eventType as string) || rawTopic,
      event_id: (event.event_id as string) || (event.eventId as string) || crypto.randomUUID(),
      timestamp: eventTimestamp,
      tenant_id: (event.tenant_id as string) || (event.tenantId as string) || '',
      namespace: (event.namespace as string) || '',
      source: (event.source as string) || '',
      correlation_id:
        (event.correlation_id as string) || (event.correlationId as string) || undefined,
      causation_id: (event.causation_id as string) || (event.causationId as string) || undefined,
      schema_ref: (event.schema_ref as string) || (event.schemaRef as string) || '',
      payload: parsedPayload,
      topic: rawTopic,
      partition,
      offset: message.offset || '0',
      processed_at: now,
      stored_at: now,
    });
    if (liveBuffer.length > MAX_LIVE_EVENT_BUS_EVENTS) {
      liveBuffer.splice(0, liveBuffer.length - MAX_LIVE_EVENT_BUS_EVENTS);
    }
  } catch (err) {
    console.debug('[EventConsumer] captureLiveEventBusEvent failed:', err);
  }
}

// ============================================================================
// Database Preload
// ============================================================================

export interface PreloadConfig {
  preloadWindowMinutes: number;
  maxPreloadEvents: number;
  enableBackfill: boolean;
  backfillMaxEvents: number;
}

export interface PreloadResult {
  preloadedEvents: EventBusEvent[];
  playbackRows: Array<{
    topic: string;
    payload: unknown;
    timestamp: string;
    partition: number | null;
  }>;
}

export async function preloadEventsFromDatabase(config: PreloadConfig): Promise<PreloadResult> {
  const cutoffDate = new Date(Date.now() - config.preloadWindowMinutes * 60 * 1000);
  const result = await getIntelligenceDb().execute(
    sql`SELECT event_type, event_id, timestamp, tenant_id, namespace, source, correlation_id, causation_id, schema_ref, payload, topic, partition, "offset", processed_at, stored_at FROM event_bus_events WHERE timestamp >= ${cutoffDate} ORDER BY timestamp DESC, id DESC LIMIT ${config.maxPreloadEvents}`
  );
  const rows = Array.isArray(result) ? result : result?.rows || result || [];
  if (!Array.isArray(rows) || rows.length === 0) return { preloadedEvents: [], playbackRows: [] };

  let backfillRows: Array<Record<string, unknown>> = [];
  if (config.enableBackfill && rows.length < config.maxPreloadEvents) {
    const remainingCapacity = Math.min(
      config.backfillMaxEvents,
      config.maxPreloadEvents - rows.length
    );
    const backfillResult = await getIntelligenceDb().execute(
      sql`SELECT event_type, event_id, timestamp, tenant_id, namespace, source, correlation_id, causation_id, schema_ref, payload, topic, partition, "offset", processed_at, stored_at FROM event_bus_events WHERE timestamp < ${cutoffDate} ORDER BY timestamp DESC, id DESC LIMIT ${remainingCapacity}`
    );
    const rawBackfill = Array.isArray(backfillResult)
      ? backfillResult
      : backfillResult?.rows || backfillResult || [];
    if (Array.isArray(rawBackfill)) backfillRows = rawBackfill as Array<Record<string, unknown>>;
  }

  const allRows = [...(rows as Array<Record<string, unknown>>), ...backfillRows];
  const preloadedEvents: EventBusEvent[] = [];

  for (const row of allRows) {
    try {
      let parsedPayload: Record<string, any>;
      try {
        parsedPayload = (
          typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload || {}
        ) as Record<string, any>;
      } catch {
        parsedPayload = {};
      }
      preloadedEvents.push({
        event_type: (row.event_type as string) || '',
        event_id: (row.event_id as string) || '',
        timestamp: (row.timestamp as string) || '',
        tenant_id: (row.tenant_id as string) || '',
        namespace: (row.namespace as string) || '',
        source: (row.source as string) || '',
        correlation_id: row.correlation_id as string | undefined,
        causation_id: row.causation_id as string | undefined,
        schema_ref: (row.schema_ref as string) || '',
        payload: parsedPayload,
        topic: (row.topic as string) || '',
        partition: (row.partition as number) || 0,
        offset: String(row.offset || '0'),
        processed_at: row.processed_at ? new Date(row.processed_at as string) : new Date(),
        stored_at: row.stored_at ? new Date(row.stored_at as string) : undefined,
      });
    } catch {
      /* skip malformed rows */
    }
  }

  const playbackRows = (
    allRows as Array<{
      topic: string;
      payload: unknown;
      timestamp: string;
      partition: number | null;
    }>
  )
    .slice()
    .reverse();
  return { preloadedEvents, playbackRows };
}

// ============================================================================
// Playback Event Injection
// ============================================================================

export interface PlaybackContext {
  domainHandlers: DomainHandler[];
  buildContext: (isDebug: boolean) => ConsumerContext;
  syncFromContext: (ctx: ConsumerContext) => void;
  monotonicMerge: {
    checkAndUpdate(key: string, entry: { eventTime: number; seq: number }): boolean;
  };
  arrivalSeqRef: { value: number };
  playbackStats: { injected: number; failed: number };
  emit: (event: string, ...args: unknown[]) => boolean;
}

export function injectPlaybackEvent(
  pctx: PlaybackContext,
  topic: string,
  event: Record<string, unknown>,
  partition?: number
): void {
  try {
    const incomingEventTime = extractEventTimeMs(event);
    const mergeKey = partition != null ? `${topic}:${partition}` : topic;
    if (
      !pctx.monotonicMerge.checkAndUpdate(mergeKey, {
        eventTime: incomingEventTime,
        seq: ++pctx.arrivalSeqRef.value,
      })
    )
      return;
    pctx.playbackStats.injected++;

    const isDebug = currentLogLevel <= LOG_LEVELS.debug;
    const ctx = pctx.buildContext(isDebug);
    let handled = false;
    for (const handler of pctx.domainHandlers) {
      if (handler.canHandle(topic)) {
        const fakeMessage = {
          value: Buffer.from(JSON.stringify(event)),
          offset: '',
          key: null,
          timestamp: '',
          size: 0,
          attributes: 0,
          headers: {},
        } as unknown as KafkaMessage;
        void handler.handleEvent(topic, event, fakeMessage, ctx);
        pctx.syncFromContext(ctx);
        handled = true;
        break;
      }
    }
    if (!handled) {
      intentLogger.debug(`Unknown playback topic: ${topic}`);
      pctx.emit('playbackEvent', { topic, event });
    }
  } catch (error) {
    pctx.playbackStats.failed++;
    intentLogger.warn(
      `[Playback] Failed to process event for topic ${topic}: ${error instanceof Error ? error.message : String(error)}`
    );
    pctx.emit('playbackError', {
      topic,
      event,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Merged Event Retrieval
// ============================================================================

const SQL_PRELOAD_LIMIT = 2000;

export function getMergedEventBusEvents(
  preloaded: EventBusEvent[],
  live: EventBusEvent[]
): EventBusEvent[] {
  if (live.length === 0) return preloaded.slice(0, SQL_PRELOAD_LIMIT);
  const seen = new Set<string>();
  const merged: EventBusEvent[] = [];
  for (const e of live) {
    if (!seen.has(e.event_id)) {
      seen.add(e.event_id);
      merged.push(e);
    }
  }
  for (const e of preloaded) {
    if (!seen.has(e.event_id)) {
      seen.add(e.event_id);
      merged.push(e);
    }
  }
  merged.sort((a, b) => {
    const td = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    return td !== 0 ? td : parseInt(b.offset || '0', 10) - parseInt(a.offset || '0', 10);
  });
  return merged.slice(0, SQL_PRELOAD_LIMIT);
}
