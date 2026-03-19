/**
 * ConsumerHealthProjection — DB-backed projection for consumer health events (OMN-5527)
 *
 * Queries the consumer_health_events table to produce:
 *  - Per-consumer current health status (green/yellow/red)
 *  - Recent health event log
 *  - Severity distribution counts within a time window
 *
 * Source table: consumer_health_events (migration 0034)
 * Source topic: onex.evt.omnibase-infra.consumer-health.v1
 */

import { sql, desc, gte } from 'drizzle-orm';
import { consumerHealthEvents } from '@shared/intelligence-schema';
import { DbBackedProjectionView } from './db-backed-projection-view';
import { tryGetIntelligenceDb } from '../storage';

// ============================================================================
// Public types
// ============================================================================

export type ConsumerHealthWindow = '1h' | '24h' | '7d';

export type HealthStatus = 'green' | 'yellow' | 'red';

export interface ConsumerHealthSummary {
  consumerIdentity: string;
  consumerGroup: string;
  topic: string;
  status: HealthStatus;
  lastEventType: string;
  lastSeverity: string;
  lastEventAt: string;
  eventCount: number;
}

export interface ConsumerHealthRecentEvent {
  id: string;
  consumerIdentity: string;
  consumerGroup: string;
  topic: string;
  eventType: string;
  severity: string;
  errorMessage: string;
  hostname: string;
  serviceLabel: string;
  emittedAt: string;
}

export interface ConsumerHealthSeverityCounts {
  info: number;
  warning: number;
  error: number;
  critical: number;
}

export interface ConsumerHealthPayload {
  consumers: ConsumerHealthSummary[];
  recentEvents: ConsumerHealthRecentEvent[];
  severityCounts: ConsumerHealthSeverityCounts;
  window: ConsumerHealthWindow;
  totalEvents: number;
}

type Db = NonNullable<ReturnType<typeof tryGetIntelligenceDb>>;

// ============================================================================
// Helpers
// ============================================================================

function windowCutoff(window: ConsumerHealthWindow): Date {
  const now = Date.now();
  if (window === '1h') return new Date(now - 60 * 60 * 1000);
  if (window === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  return new Date(now - 24 * 60 * 60 * 1000);
}

function deriveStatus(severity: string, eventType: string): HealthStatus {
  if (
    severity === 'CRITICAL' ||
    eventType === 'SESSION_TIMEOUT' ||
    eventType === 'CONSUMER_CRASHED'
  ) {
    return 'red';
  }
  if (severity === 'ERROR' || eventType === 'HEARTBEAT_FAILURE') {
    return 'yellow';
  }
  return 'green';
}

// ============================================================================
// Projection class
// ============================================================================

export class ConsumerHealthProjection extends DbBackedProjectionView<ConsumerHealthPayload> {
  readonly viewId = 'consumer-health';

  private windowCache = new Map<
    ConsumerHealthWindow,
    { payload: ConsumerHealthPayload; ts: number }
  >();

  emptyPayload(): ConsumerHealthPayload {
    return {
      consumers: [],
      recentEvents: [],
      severityCounts: { info: 0, warning: 0, error: 0, critical: 0 },
      window: '24h',
      totalEvents: 0,
    };
  }

  protected async querySnapshot(db: Db): Promise<ConsumerHealthPayload> {
    return this._computeForWindow(db, '24h');
  }

  async ensureFreshForWindow(window: ConsumerHealthWindow): Promise<ConsumerHealthPayload> {
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
    window: ConsumerHealthWindow
  ): Promise<ConsumerHealthPayload> {
    const cutoff = windowCutoff(window);

    // Recent events (100 most recent)
    const rows = await db
      .select()
      .from(consumerHealthEvents)
      .where(gte(consumerHealthEvents.emittedAt, cutoff))
      .orderBy(desc(consumerHealthEvents.emittedAt))
      .limit(100);

    const recentEvents: ConsumerHealthRecentEvent[] = rows.map((r) => ({
      id: r.id,
      consumerIdentity: r.consumerIdentity,
      consumerGroup: r.consumerGroup,
      topic: r.topic,
      eventType: r.eventType,
      severity: r.severity,
      errorMessage: r.errorMessage,
      hostname: r.hostname ?? '',
      serviceLabel: r.serviceLabel ?? '',
      emittedAt: r.emittedAt.toISOString(),
    }));

    // Latest state per consumer (most-recent-wins)
    const consumerMap = new Map<string, ConsumerHealthSummary>();
    for (const ev of [...recentEvents].reverse()) {
      const existing = consumerMap.get(ev.consumerIdentity);
      consumerMap.set(ev.consumerIdentity, {
        consumerIdentity: ev.consumerIdentity,
        consumerGroup: ev.consumerGroup,
        topic: ev.topic,
        status: deriveStatus(ev.severity, ev.eventType),
        lastEventType: ev.eventType,
        lastSeverity: ev.severity,
        lastEventAt: ev.emittedAt,
        eventCount: (existing?.eventCount ?? 0) + 1,
      });
    }
    const consumers = Array.from(consumerMap.values()).sort((a, b) =>
      a.consumerIdentity.localeCompare(b.consumerIdentity)
    );

    // Severity distribution
    const severityCounts: ConsumerHealthSeverityCounts = {
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };
    for (const ev of recentEvents) {
      const sev = ev.severity.toLowerCase();
      if (sev === 'critical') severityCounts.critical++;
      else if (sev === 'error') severityCounts.error++;
      else if (sev === 'warning') severityCounts.warning++;
      else severityCounts.info++;
    }

    // Total in window
    const countResult = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(consumerHealthEvents)
      .where(gte(consumerHealthEvents.emittedAt, cutoff));
    const totalEvents = countResult[0]?.n ?? 0;

    return {
      consumers,
      recentEvents,
      severityCounts,
      window,
      totalEvents,
    };
  }
}
