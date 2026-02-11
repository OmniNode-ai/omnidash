/**
 * Shared projection types used by both server and client (OMN-2097)
 *
 * Extracted from server/projection-service.ts and
 * server/projections/node-registry-projection.ts to provide compile-time
 * drift detection across the client/server boundary via the @shared/ alias.
 */

// ============================================================================
// Projection envelope types
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
 * Response envelope for events-since queries.
 */
export interface ProjectionEventsResponse {
  viewId: string;
  /** Cursor: max(ingestSeq) in the returned events */
  cursor: number;
  snapshotTimeMs: number;
  events: ProjectionEvent[];
  /** True when earlier events were trimmed from the buffer — client should fetch a full snapshot instead of relying on incremental catch-up */
  truncated?: boolean;
}

// ============================================================================
// Node Registry domain types
// ============================================================================

export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR';

/**
 * Registration state values use lowercase. Canonical event handlers in EventConsumer
 * use uppercase states ('ACTIVE', 'OFFLINE', 'PENDING') internally but convert them
 * to these lowercase values via mapCanonicalState() before emitting to consumers.
 * If bypassing EventConsumer (e.g., direct Kafka bridging), ensure the mapping is applied.
 */
export type RegistrationState =
  | 'pending_registration'
  | 'accepted'
  | 'awaiting_ack'
  | 'ack_received'
  | 'active'
  | 'rejected'
  | 'ack_timed_out'
  | 'liveness_expired';

export interface NodeState {
  nodeId: string;
  nodeType: NodeType;
  state: RegistrationState;
  version: string;
  uptimeSeconds: number;
  lastSeen: string;
  memoryUsageMb?: number;
  cpuUsagePercent?: number;
  endpoints?: Record<string, string>;
}

export interface NodeRegistryStats {
  totalNodes: number;
  activeNodes: number;
  byState: Record<string, number>;
}

export interface NodeRegistryPayload {
  nodes: NodeState[];
  recentStateChanges: ProjectionEvent[];
  stats: NodeRegistryStats;
}
