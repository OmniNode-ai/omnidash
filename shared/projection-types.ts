/**
 * Shared Projection Types (OMN-2094 / OMN-2095 / OMN-2096)
 *
 * Single source of truth for projection types shared between server and client.
 * Both server (ProjectionService, EventBusProjection, IntentProjectionView)
 * and client (useProjectionStream, EventBusMonitor, IntentDashboard)
 * import from here to prevent type drift.
 */

// ============================================================================
// Generic snapshot envelope (wire format)
// ============================================================================

/**
 * Standardized response envelope for view snapshots.
 *
 * @template T - The payload type specific to each view
 */
export interface ProjectionResponse<T> {
  viewId: string;
  /** Cursor: max(ingestSeq) in the current snapshot */
  cursor: number;
  /** Timestamp when snapshot was captured */
  snapshotTimeMs: number;
  payload: T;
}

/**
 * Alias for backward-compatible imports (OMN-2096 intent hook).
 * Identical to ProjectionResponse.
 */
export type ProjectionSnapshot<T> = ProjectionResponse<T>;

// ============================================================================
// Canonical projection event
// ============================================================================

/**
 * Canonical event shape flowing through projections.
 * Every raw event (Kafka, DB preload, playback) is wrapped into this
 * before being routed to views.
 */
export interface ProjectionEvent {
  /** Unique event identifier (from source, or `proj-{ingestSeq}` fallback) */
  id: string;
  /** Event timestamp in epoch milliseconds (producer-assigned) */
  eventTimeMs: number;
  /** Monotonically increasing sequence assigned by ProjectionService */
  ingestSeq: number;
  /** Kafka topic or source identifier */
  topic: string;
  /** Event type (e.g. 'node-heartbeat', 'session-started') */
  type: string;
  /** Producer/source identifier */
  source: string;
  /** Severity level for display purposes */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Event payload (domain-specific data) */
  payload: Record<string, unknown>;
  /** True when no timestamp could be extracted — eventTimeMs is the sentinel (0) */
  eventTimeMissing?: boolean;
  /** Error details, if this is an error event */
  error?: { message: string; stack?: string };
}

/**
 * Response envelope for events-since queries.
 * Used by both server (ProjectionView.getEventsSince) and client (useProjectionStream catch-up).
 */
export interface ProjectionEventsResponse {
  viewId: string;
  /** Cursor: max(ingestSeq) in the returned events */
  cursor: number;
  snapshotTimeMs: number;
  events: ProjectionEvent[];
  /** True when internal event log was trimmed and events after the requested cursor may be missing. Clients should re-fetch the full snapshot. */
  truncated?: boolean;
}

// ============================================================================
// Projection event item (client wire format)
// ============================================================================

/**
 * A projection event as serialized in snapshot JSON payloads.
 * Subset of the server-side ProjectionEvent — only fields that
 * cross the wire to the client.
 */
export interface ProjectionEventItem {
  id: string;
  eventTimeMs: number;
  ingestSeq: number;
  type: string;
  topic: string;
  source: string;
  severity: ProjectionEvent['severity'];
  payload: Record<string, unknown>;
}

// ============================================================================
// Intent projection payload (OMN-2096)
// ============================================================================

/**
 * Distribution entry for intent category statistics.
 */
export interface IntentDistributionEntry {
  category: string;
  count: number;
  percentage: number;
}

/**
 * Intent projection snapshot payload.
 * Returned by GET /api/projections/intent/snapshot.
 *
 * Each item in `recentIntents` carries an intent-specific `payload` with
 * expected fields: `intent_category` (string), `confidence` (number 0-1),
 * `session_ref` (string), `keywords` (string[]). See `IntentRecordPayload`
 * in `shared/intent-types.ts` for the canonical intent payload schema.
 */
export interface IntentProjectionPayload {
  recentIntents: ProjectionEventItem[];
  distribution: IntentDistributionEntry[];
  totalIntents: number;
  categoryCount: number;
  lastEventTimeMs: number | null;
}
