/**
 * NodeRegistryProjection — Server-side projection for node registry state (OMN-2097)
 *
 * Materializes incremental node state from EventConsumer emissions into a
 * queryable snapshot. Uses MonotonicMergeTracker per node ID to enforce
 * event-time-wins ordering and reject stale updates.
 *
 * Maintained state:
 * - nodes: Map<string, NodeState>         — current state per node
 * - recentStateChanges: ProjectionEvent[] — bounded buffer (100 max)
 * - stats: { totalNodes, activeNodes, byState } — incremental counters
 * - cursor: number                        — max(ingestSeq) applied
 *
 * Listens to event types:
 * - 'node-introspection'  → upsert node from introspection data
 * - 'node-heartbeat'      → update node health metrics
 * - 'node-state-change'   → update node state, track in recentStateChanges
 * - 'node-registry-seed'  → bulk seed from EventConsumer.getRegisteredNodes()
 */

import type { ProjectionView } from '../projection-service';
import type {
  ProjectionEvent,
  ProjectionResponse,
  ProjectionEventsResponse,
  NodeType,
  RegistrationState,
  NodeState,
  NodeRegistryStats,
  NodeRegistryPayload,
} from '@shared/projection-types';
import { MonotonicMergeTracker, MISSING_TIMESTAMP_SENTINEL_MS } from '../monotonic-merge';

// Re-export shared types for consumers that import from this module
export type {
  NodeType,
  RegistrationState,
  NodeState,
  NodeRegistryStats,
  NodeRegistryPayload,
} from '@shared/projection-types';

// ============================================================================
// Constants
// ============================================================================

const VIEW_ID = 'node-registry';
const MAX_RECENT_STATE_CHANGES = 100;
const MAX_APPLIED_EVENTS = 500;
/** Trim appliedEvents when it exceeds MAX by this many, amortizing the O(n) slice cost. */
const APPLIED_EVENTS_TRIM_MARGIN = 100;

/** Event types this view handles */
const HANDLED_EVENT_TYPES = new Set([
  'node-introspection',
  'node-heartbeat',
  'node-state-change',
  'node-registry-seed',
]);

// ============================================================================
// NodeRegistryProjection
// ============================================================================

export class NodeRegistryProjection implements ProjectionView<NodeRegistryPayload> {
  readonly viewId = VIEW_ID;

  private nodes = new Map<string, NodeState>();
  private recentStateChanges: ProjectionEvent[] = [];
  private appliedEvents: ProjectionEvent[] = [];
  private cursor = 0;
  private mergeTracker = new MonotonicMergeTracker();

  // Incremental stats — maintained on every node mutation to avoid O(n) recalc
  private stats: NodeRegistryStats = {
    totalNodes: 0,
    activeNodes: 0,
    byState: {},
  };

  // --------------------------------------------------------------------------
  // ProjectionView interface
  // --------------------------------------------------------------------------

  /** Returns a defensive deep copy of the current node registry state, stats, and recent state changes. */
  getSnapshot(options?: { limit?: number }): ProjectionResponse<NodeRegistryPayload> {
    const allNodes = Array.from(this.nodes.values()).map((n) => ({
      ...n,
      endpoints: n.endpoints ? { ...n.endpoints } : undefined,
    }));
    const nodes = options?.limit ? allNodes.slice(0, options.limit) : allNodes;

    return {
      viewId: this.viewId,
      cursor: this.cursor,
      snapshotTimeMs: Date.now(),
      payload: {
        nodes,
        // Deep copy events to isolate nested payload objects from internal state
        recentStateChanges: this.recentStateChanges.map((e) => ({
          ...e,
          payload: { ...e.payload },
        })),
        stats: { ...this.stats, byState: { ...this.stats.byState } },
      },
    };
  }

  /** Returns applied events with ingestSeq > cursor (exclusive). Uses binary search for O(log n) lookup. */
  getEventsSince(cursor: number, limit?: number): ProjectionEventsResponse {
    // Detect whether the buffer was trimmed past the client's cursor.
    // If the oldest available event has a seq more than 1 ahead of the
    // requested cursor, earlier events were discarded and the client
    // should fall back to a full snapshot refresh.
    const oldestAvailableSeq = this.appliedEvents.length > 0 ? this.appliedEvents[0].ingestSeq : 0;
    const truncated = cursor > 0 && oldestAvailableSeq > cursor + 1;

    // Binary search for the first event with ingestSeq > cursor.
    // appliedEvents are appended in ingestSeq order, so binary search is valid.
    let lo = 0;
    let hi = this.appliedEvents.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.appliedEvents[mid].ingestSeq <= cursor) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    const effectiveLimit = limit ?? this.appliedEvents.length;
    const sliced = this.appliedEvents.slice(lo, lo + effectiveLimit);
    return {
      viewId: this.viewId,
      cursor:
        sliced.length > 0 ? sliced[sliced.length - 1].ingestSeq : Math.max(cursor, this.cursor),
      snapshotTimeMs: Date.now(),
      // Deep copy events consistent with getSnapshot() to isolate from internal state
      events: sliced.map((e) => ({ ...e, payload: { ...e.payload } })),
      ...(truncated && { truncated }),
    };
  }

  /** Routes an event to the appropriate handler and advances the cursor on success. */
  applyEvent(event: ProjectionEvent): boolean {
    if (!HANDLED_EVENT_TYPES.has(event.type)) {
      return false;
    }

    let applied = false;

    switch (event.type) {
      case 'node-introspection':
        applied = this.handleIntrospection(event);
        break;
      case 'node-heartbeat':
        applied = this.handleHeartbeat(event);
        break;
      case 'node-state-change':
        applied = this.handleStateChange(event);
        break;
      case 'node-registry-seed':
        applied = this.handleSeed(event);
        break;
    }

    if (applied) {
      this.cursor = Math.max(this.cursor, event.ingestSeq);
      this.appliedEvents.push(event);
      if (this.appliedEvents.length > MAX_APPLIED_EVENTS + APPLIED_EVENTS_TRIM_MARGIN) {
        this.appliedEvents = this.appliedEvents.slice(-MAX_APPLIED_EVENTS);
      }
    }

    return applied;
  }

  /** Clears all nodes, stats, applied events, recent state changes, and resets the merge tracker and cursor. */
  reset(): void {
    this.nodes.clear();
    this.recentStateChanges = [];
    this.appliedEvents = [];
    this.cursor = 0;
    this.mergeTracker.reset();
    this.stats = { totalNodes: 0, activeNodes: 0, byState: {} };
  }

  // --------------------------------------------------------------------------
  // Event handlers
  // --------------------------------------------------------------------------

  private handleIntrospection(event: ProjectionEvent): boolean {
    const payload = event.payload;
    const nodeId = (payload.nodeId ?? payload.node_id) as string | undefined;
    if (!nodeId) return false;

    if (
      !this.mergeTracker.checkAndUpdate(nodeId, {
        eventTime: event.eventTimeMs,
        seq: event.ingestSeq,
      })
    ) {
      return false;
    }

    const existing = this.nodes.get(nodeId);
    const oldState = existing?.state;

    const node: NodeState = {
      nodeId,
      nodeType: (payload.nodeType ??
        payload.node_type ??
        existing?.nodeType ??
        'COMPUTE') as NodeType,
      state: (payload.currentState ??
        payload.current_state ??
        existing?.state ??
        'pending_registration') as RegistrationState,
      version: (payload.nodeVersion ??
        payload.node_version ??
        existing?.version ??
        '1.0.0') as string,
      uptimeSeconds: existing?.uptimeSeconds ?? 0,
      lastSeen: new Date(event.eventTimeMs || Date.now()).toISOString(),
      memoryUsageMb: existing?.memoryUsageMb,
      cpuUsagePercent: existing?.cpuUsagePercent,
      endpoints: (payload.endpoints ?? existing?.endpoints) as Record<string, string> | undefined,
    };

    this.nodes.set(nodeId, node);
    this.updateStats(oldState, node.state, !existing);

    return true;
  }

  private handleHeartbeat(event: ProjectionEvent): boolean {
    const payload = event.payload;
    const nodeId = (payload.nodeId ?? payload.node_id) as string | undefined;
    if (!nodeId) return false;

    if (
      !this.mergeTracker.checkAndUpdate(nodeId, {
        eventTime: event.eventTimeMs,
        seq: event.ingestSeq,
      })
    ) {
      return false;
    }

    const existing = this.nodes.get(nodeId);
    if (!existing) {
      // Heartbeat for unknown node — create a minimal entry
      const node: NodeState = {
        nodeId,
        nodeType: 'COMPUTE',
        state: 'active',
        version: '1.0.0',
        uptimeSeconds: (payload.uptimeSeconds ?? payload.uptime_seconds ?? 0) as number,
        lastSeen: new Date(event.eventTimeMs || Date.now()).toISOString(),
        memoryUsageMb: (payload.memoryUsageMb ?? payload.memory_usage_mb) as number | undefined,
        cpuUsagePercent: (payload.cpuUsagePercent ?? payload.cpu_usage_percent) as
          | number
          | undefined,
      };
      this.nodes.set(nodeId, node);
      this.updateStats(undefined, node.state, true);
      return true;
    }

    this.nodes.set(nodeId, {
      ...existing,
      uptimeSeconds: (payload.uptimeSeconds ??
        payload.uptime_seconds ??
        existing.uptimeSeconds) as number,
      lastSeen: new Date(event.eventTimeMs || Date.now()).toISOString(),
      memoryUsageMb: (payload.memoryUsageMb ??
        payload.memory_usage_mb ??
        existing.memoryUsageMb) as number | undefined,
      cpuUsagePercent: (payload.cpuUsagePercent ??
        payload.cpu_usage_percent ??
        existing.cpuUsagePercent) as number | undefined,
    });

    return true;
  }

  private handleStateChange(event: ProjectionEvent): boolean {
    const payload = event.payload;
    const nodeId = (payload.nodeId ?? payload.node_id) as string | undefined;
    if (!nodeId) return false;

    const newState = (payload.newState ?? payload.new_state) as RegistrationState | undefined;
    if (!newState) return false;

    if (
      !this.mergeTracker.checkAndUpdate(nodeId, {
        eventTime: event.eventTimeMs,
        seq: event.ingestSeq,
      })
    ) {
      return false;
    }

    const existing = this.nodes.get(nodeId);
    const oldState = existing?.state;

    if (existing) {
      this.nodes.set(nodeId, {
        ...existing,
        state: newState,
        lastSeen: new Date(event.eventTimeMs || Date.now()).toISOString(),
      });
    } else {
      // State change for unknown node — create a minimal entry so the
      // transition is actually tracked (mirrors handleHeartbeat behavior)
      this.nodes.set(nodeId, {
        nodeId,
        nodeType: 'COMPUTE',
        state: newState,
        version: '1.0.0',
        uptimeSeconds: 0,
        lastSeen: new Date(event.eventTimeMs || Date.now()).toISOString(),
      });
    }

    this.updateStats(oldState, newState, !existing);

    // Track in recentStateChanges (clone to isolate from appliedEvents references)
    this.recentStateChanges.unshift({ ...event, payload: { ...event.payload } });
    if (this.recentStateChanges.length > MAX_RECENT_STATE_CHANGES) {
      this.recentStateChanges.splice(MAX_RECENT_STATE_CHANGES);
    }

    return true;
  }

  /**
   * Bulk seed handler — used to populate initial state from
   * EventConsumer.getRegisteredNodes() on startup.
   */
  private handleSeed(event: ProjectionEvent): boolean {
    const payload = event.payload;
    const nodes = payload.nodes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(nodes) || nodes.length === 0) return false;

    let seeded = 0;

    for (const raw of nodes) {
      const nodeId = (raw.nodeId ?? raw.node_id) as string;
      if (!nodeId) continue;

      // Seed events have no real timestamp — use sentinel epoch 0 so that
      // any node already tracked with a real-timestamped event is not overwritten.
      if (
        !this.mergeTracker.checkAndUpdate(nodeId, {
          eventTime: MISSING_TIMESTAMP_SENTINEL_MS,
          seq: event.ingestSeq,
        })
      ) {
        continue; // Node already has fresher data — skip seed entry
      }

      const node: NodeState = {
        nodeId,
        nodeType: (raw.nodeType ?? raw.node_type ?? 'COMPUTE') as NodeType,
        state: (raw.state ?? 'pending_registration') as RegistrationState,
        version: (raw.version ?? '1.0.0') as string,
        uptimeSeconds: (raw.uptimeSeconds ?? raw.uptime_seconds ?? 0) as number,
        lastSeen: raw.lastSeen
          ? raw.lastSeen instanceof Date
            ? (raw.lastSeen as Date).toISOString()
            : String(raw.lastSeen)
          : new Date().toISOString(),
        memoryUsageMb: (raw.memoryUsageMb ?? raw.memory_usage_mb) as number | undefined,
        cpuUsagePercent: (raw.cpuUsagePercent ?? raw.cpu_usage_percent) as number | undefined,
        endpoints: raw.endpoints as Record<string, string> | undefined,
      };

      this.nodes.set(nodeId, node);
      seeded++;
    }

    if (seeded === 0) return false;

    this.rebuildStats();
    return true;
  }

  // --------------------------------------------------------------------------
  // Stats maintenance
  // --------------------------------------------------------------------------

  /**
   * Incrementally update stats when a single node's state changes.
   * Avoids O(n) full recalculation on every event.
   */
  private updateStats(
    oldState: RegistrationState | undefined,
    newState: RegistrationState,
    isNew: boolean
  ): void {
    if (isNew) {
      this.stats.totalNodes++;
    }

    // Decrement old state counter (guarded against negative from out-of-order events)
    if (oldState) {
      this.stats.byState[oldState] = Math.max(0, (this.stats.byState[oldState] ?? 0) - 1);
      if (this.stats.byState[oldState] <= 0) {
        delete this.stats.byState[oldState];
      }
      if (oldState === 'active') {
        this.stats.activeNodes = Math.max(0, this.stats.activeNodes - 1);
      }
    }

    // Increment new state counter
    this.stats.byState[newState] = (this.stats.byState[newState] ?? 0) + 1;
    if (newState === 'active') {
      this.stats.activeNodes++;
    }
  }

  /** Full stats rebuild — used after bulk seed operations. */
  private rebuildStats(): void {
    const byState: Record<string, number> = {};
    let activeNodes = 0;

    for (const node of this.nodes.values()) {
      byState[node.state] = (byState[node.state] ?? 0) + 1;
      if (node.state === 'active') {
        activeNodes++;
      }
    }

    this.stats = {
      totalNodes: this.nodes.size,
      activeNodes,
      byState,
    };
  }
}
