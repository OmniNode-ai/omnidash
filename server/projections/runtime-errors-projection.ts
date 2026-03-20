/**
 * RuntimeErrorsProjection — DB-backed projection for runtime error events (OMN-5528)
 *
 * Queries the runtime_error_events table to produce:
 *  - Error category breakdown
 *  - Top fingerprints by occurrence
 *  - Recent error event log
 *
 * Source table: runtime_error_events (migration 0036)
 * Source topic: onex.evt.omnibase-infra.runtime-error.v1
 */

import { sql, desc, gte } from 'drizzle-orm';
import { runtimeErrorEvents } from '@shared/intelligence-schema';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Public types
// ============================================================================

export type RuntimeErrorWindow = '1h' | '24h' | '7d';

export interface RuntimeErrorCategoryCounts {
  kafkaConsumer: number;
  kafkaProducer: number;
  database: number;
  httpClient: number;
  httpServer: number;
  runtime: number;
  unknown: number;
}

export interface RuntimeErrorTopFingerprint {
  fingerprint: string;
  messageTemplate: string;
  errorCategory: string;
  loggerFamily: string;
  occurrences: number;
  lastSeenAt: string;
}

export interface RuntimeErrorRecentEvent {
  id: string;
  loggerFamily: string;
  logLevel: string;
  messageTemplate: string;
  errorCategory: string;
  severity: string;
  fingerprint: string;
  exceptionType: string;
  exceptionMessage: string;
  hostname: string;
  serviceLabel: string;
  emittedAt: string;
}

export interface RuntimeErrorsPayload {
  categoryCounts: RuntimeErrorCategoryCounts;
  topFingerprints: RuntimeErrorTopFingerprint[];
  recentEvents: RuntimeErrorRecentEvent[];
  window: RuntimeErrorWindow;
  totalEvents: number;
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Helpers
// ============================================================================

function windowCutoff(window: RuntimeErrorWindow): Date {
  const now = Date.now();
  if (window === '1h') return new Date(now - 60 * 60 * 1000);
  if (window === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  return new Date(now - 24 * 60 * 60 * 1000);
}

// ============================================================================
// Projection class
// ============================================================================

export class RuntimeErrorsProjection extends DbBackedProjectionView<RuntimeErrorsPayload> {
  readonly viewId = 'runtime-errors';

  private windowCache = new Map<
    RuntimeErrorWindow,
    { payload: RuntimeErrorsPayload; ts: number }
  >();

  emptyPayload(): RuntimeErrorsPayload {
    return {
      categoryCounts: {
        kafkaConsumer: 0,
        kafkaProducer: 0,
        database: 0,
        httpClient: 0,
        httpServer: 0,
        runtime: 0,
        unknown: 0,
      },
      topFingerprints: [],
      recentEvents: [],
      window: '24h',
      totalEvents: 0,
    };
  }

  protected async querySnapshot(db: Db): Promise<RuntimeErrorsPayload> {
    return this._computeForWindow(db, '24h');
  }

  async ensureFreshForWindow(window: RuntimeErrorWindow): Promise<RuntimeErrorsPayload> {
    const cached = this.windowCache.get(window);
    if (cached && Date.now() - cached.ts < 10_000) return cached.payload;

    const db = tryGetIntelligenceDb();
    if (!db) return { ...this.emptyPayload(), window };

    const payload = await this._computeForWindow(db, window);
    this.windowCache.set(window, { payload, ts: Date.now() });
    return payload;
  }

  private async _computeForWindow(
    db: Db,
    window: RuntimeErrorWindow
  ): Promise<RuntimeErrorsPayload> {
    const cutoff = windowCutoff(window);

    // Recent events (100 most recent)
    const rows = await db
      .select()
      .from(runtimeErrorEvents)
      .where(gte(runtimeErrorEvents.emittedAt, cutoff))
      .orderBy(desc(runtimeErrorEvents.emittedAt))
      .limit(100);

    const recentEvents: RuntimeErrorRecentEvent[] = rows.map((r) => ({
      id: r.id,
      loggerFamily: r.loggerFamily,
      logLevel: r.logLevel,
      messageTemplate: r.messageTemplate,
      errorCategory: r.errorCategory,
      severity: r.severity,
      fingerprint: r.fingerprint,
      exceptionType: r.exceptionType,
      exceptionMessage: r.exceptionMessage,
      hostname: r.hostname ?? '',
      serviceLabel: r.serviceLabel ?? '',
      emittedAt: r.emittedAt.toISOString(),
    }));

    // Category distribution
    const categoryCounts: RuntimeErrorCategoryCounts = {
      kafkaConsumer: 0,
      kafkaProducer: 0,
      database: 0,
      httpClient: 0,
      httpServer: 0,
      runtime: 0,
      unknown: 0,
    };
    for (const ev of recentEvents) {
      const cat = ev.errorCategory.toUpperCase();
      if (cat === 'KAFKA_CONSUMER') categoryCounts.kafkaConsumer++;
      else if (cat === 'KAFKA_PRODUCER') categoryCounts.kafkaProducer++;
      else if (cat === 'DATABASE') categoryCounts.database++;
      else if (cat === 'HTTP_CLIENT') categoryCounts.httpClient++;
      else if (cat === 'HTTP_SERVER') categoryCounts.httpServer++;
      else if (cat === 'RUNTIME') categoryCounts.runtime++;
      else categoryCounts.unknown++;
    }

    // Top fingerprints by occurrence
    const fpMap = new Map<
      string,
      {
        messageTemplate: string;
        errorCategory: string;
        loggerFamily: string;
        count: number;
        lastSeenAt: string;
      }
    >();
    for (const ev of recentEvents) {
      const existing = fpMap.get(ev.fingerprint);
      if (existing) {
        existing.count++;
      } else {
        fpMap.set(ev.fingerprint, {
          messageTemplate: ev.messageTemplate,
          errorCategory: ev.errorCategory,
          loggerFamily: ev.loggerFamily,
          count: 1,
          lastSeenAt: ev.emittedAt,
        });
      }
    }
    const topFingerprints: RuntimeErrorTopFingerprint[] = Array.from(fpMap.entries())
      .map(([fingerprint, data]) => ({
        fingerprint,
        messageTemplate: data.messageTemplate,
        errorCategory: data.errorCategory,
        loggerFamily: data.loggerFamily,
        occurrences: data.count,
        lastSeenAt: data.lastSeenAt,
      }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 20);

    // Total in window
    const countResult = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(runtimeErrorEvents)
      .where(gte(runtimeErrorEvents.emittedAt, cutoff));
    const totalEvents = countResult[0]?.n ?? 0;

    return {
      categoryCounts,
      topFingerprints,
      recentEvents,
      window,
      totalEvents,
    };
  }
}
