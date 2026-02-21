/**
 * Shared Projection Types (OMN-2095 / OMN-2096 / OMN-2097)
 *
 * Single source of truth for projection types shared between server and client.
 * Both server (ProjectionService, EventBusProjection, IntentProjectionView, NodeRegistryProjection)
 * and client (useProjectionStream, EventBusMonitor, IntentDashboard, NodeRegistry)
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
  /** Display-only enrichment metadata derived by enrichment handlers */
  enrichment?: EventEnrichment;
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
  /** True when earlier events were trimmed from the buffer — client should fetch a full snapshot instead of relying on incremental catch-up */
  truncated?: boolean;
}

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
  /** Display-only enrichment metadata derived by enrichment handlers */
  enrichment?: EventEnrichment;
}

// ============================================================================
// Event enrichment types (OMN-2416)
// ============================================================================

/**
 * High-level category assigned to an event by enrichment handlers.
 * Handlers derive ONLY display metadata — no domain logic.
 */
export type EventCategory =
  | 'tool_event'
  | 'routing_event'
  | 'intent_event'
  | 'node_heartbeat'
  | 'node_lifecycle'
  | 'error_event'
  | 'unknown';

/**
 * Kind of artifact referenced or produced by a tool event.
 */
export type ArtifactKind =
  | 'file_read'
  | 'file_write'
  | 'file_edit'
  | 'glob_pattern'
  | 'bash_command';

/**
 * A single artifact extracted from an event for display purposes.
 */
export interface EventArtifact {
  kind: ArtifactKind;
  value: string;
  /** Optional human-readable label (e.g. shortened path) */
  display?: string;
}

/**
 * Enrichment metadata attached to an event by enrichment handlers.
 * All fields are derived solely for display — invariant: no domain logic.
 *
 * Note: the optional fields below form a flat bag where each field is only
 * meaningful for a specific category value (e.g. `toolName`/`filePath`/
 * `bashCommand` are tool_event fields; `selectedAgent`/`confidence` are
 * routing_event fields; etc.). A future refactor should replace this flat
 * bag with a discriminated union keyed on `category` so that TypeScript can
 * narrow the available fields per category without runtime guards.
 */
export interface EventEnrichment {
  enrichmentVersion: 'v1';
  /** Handler identifier that produced this enrichment */
  handler: string;
  category: EventCategory;
  /**
   * Short human-readable summary (≤60 chars).
   * Producers MUST enforce this limit; consumers MAY truncate defensively
   * (e.g. `summary.slice(0, 57) + '...'`) but are not required to.
   */
  summary: string;
  /** Normalized event type string for display */
  normalizedType: string;
  /** Artifacts referenced or produced by this event */
  artifacts: EventArtifact[];
  // Optional display-only fields
  toolName?: string;
  filePath?: string;
  bashCommand?: string;
  nodeId?: string;
  healthStatus?: string;
  selectedAgent?: string;
  confidence?: number;
  intentType?: string;
  actionName?: string;
  error?: string;
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

// ============================================================================
// Node Registry domain types (OMN-2097)
// ============================================================================

export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR' | 'SERVICE';

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

/**
 * Introspection reason indicating why a node announced itself.
 */
export type IntrospectionReason =
  | 'STARTUP'
  | 'SHUTDOWN'
  | 'HEARTBEAT'
  | 'REQUESTED'
  | 'CONFIG_CHANGE';

/**
 * Structured capabilities reported by a node during introspection.
 */
export interface NodeCapabilities {
  /** Capabilities declared in the node manifest */
  declared?: string[];
  /** Capabilities discovered at runtime */
  discovered?: string[];
  /** Capabilities enforced by the node's contract */
  contract?: string[];
}

/**
 * Node metadata reported during introspection.
 */
export interface NodeMetadata {
  environment?: string;
  region?: string;
  cluster?: string;
  description?: string;
  priority?: number;
}

/**
 * Canonical node state used by both server projections and client rendering.
 * This is the single source of truth replacing the deprecated RegistryNodeView.
 */
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
  /** Structured capabilities from introspection events */
  capabilities?: NodeCapabilities;
  /** Node metadata from introspection events */
  metadata?: NodeMetadata;
  /** Reason for the most recent introspection announcement */
  reason?: IntrospectionReason;
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
