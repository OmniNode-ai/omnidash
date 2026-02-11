/**
 * Shared EventBusPayload type (OMN-2095)
 *
 * Single source of truth for the event-bus projection snapshot payload.
 * Used by both server (EventBusProjection.getSnapshot) and client
 * (event-bus-projection-source fetcher).
 */

import type { ProjectionEvent } from './projection-types';

/** Time-series bucket width used by both server and client for chart alignment */
export const TIME_SERIES_BUCKET_MS = 15_000; // 15 seconds

/**
 * Event shape within the projection snapshot.
 * Alias of ProjectionEvent from shared/projection-types (single source of truth).
 */
export type EventBusSnapshotEvent = ProjectionEvent;

/**
 * Burst/spike detection state (OMN-2158).
 *
 * Represents a detected throughput burst or error spike, including
 * the short-window vs baseline comparison and cooldown timing.
 */
export interface BurstInfo {
  /** Whether this is a throughput burst or an error spike */
  type: 'throughput' | 'error_spike';
  /** Rate in the short window (events/sec for throughput, fraction for error) */
  shortWindowRate: number;
  /** Rate in the baseline/monitoring window */
  baselineRate: number;
  /** Actual multiplier: shortWindowRate / baselineRate */
  multiplier: number;
  /** Epoch ms when the burst was first detected */
  detectedAt: number;
  /** Epoch ms when the cooldown expires */
  cooldownUntil: number;
}

/**
 * Snapshot payload returned by the event-bus projection.
 * All aggregates are pre-computed server-side — no O(n) scans on read.
 */
export interface EventBusPayload {
  events: EventBusSnapshotEvent[];
  topicBreakdown: Record<string, number>;
  eventTypeBreakdown: Record<string, number>;
  timeSeries: Array<{ bucketKey: number; count: number }>;
  eventsPerSecond: number;
  errorCount: number;
  activeTopics: number;
  totalEventsIngested: number;

  // ── Burst detection fields (OMN-2158) ──────────────────────────────
  /** Monitoring window used for baseline computation (ms) */
  monitoringWindowMs: number;
  /** Staleness threshold — independent from monitoring window (ms) */
  stalenessThresholdMs: number;
  /** Short window used for burst detection (ms) */
  burstWindowMs: number;
  /** Error rate computed within monitoringWindowMs (0.0–1.0) — fixes latent whole-buffer bug */
  windowedErrorRate: number;
  /** Current burst/spike state, or null if no burst active */
  burstInfo: BurstInfo | null;
}
