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

import type {
  ProjectionView,
  ProjectionResponse,
  ProjectionEventsResponse,
  ProjectionEvent,
} from '../projection-service';
import { MonotonicMergeTracker } from '../monotonic-merge';

// ============================================================================
// Types
// ============================================================================

export type NodeType = 'EFFECT' | 'COMPUTE' | 'REDUCER' | 'ORCHESTRATOR';

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

// ============================================================================
// Constants
// ============================================================================

const VIEW_ID = 'node-registry';
const MAX_RECENT_STATE_CHANGES = 100;
const MAX_APPLIED_EVENTS = 500;

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

  getSnapshot(_options?: { limit?: number }): ProjectionResponse<NodeRegistryPayload> {
    return {
      viewId: this.viewId,
      cursor: this.cursor,
      snapshotTimeMs: Date.now(),
      payload: {
        nodes: Array.from(this.nodes.values()),
        recentStateChanges: this.recentStateChanges,
        stats: { ...this.stats, byState: { ...this.stats.byState } },
      },
    };
  }

  getEventsSince(cursor: number, limit?: number): ProjectionEventsResponse {
    const events = this.appliedEvents.filter((e) => e.ingestSeq > cursor);
    const sliced = limit ? events.slice(0, limit) : events;
    return {
      viewId: this.viewId,
      cursor: sliced.length > 0 ? sliced[sliced.length - 1].ingestSeq : cursor,
      snapshotTimeMs: Date.now(),
      events: sliced,
    };
  }

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
      if (this.appliedEvents.length > MAX_APPLIED_EVENTS) {
        this.appliedEvents = this.appliedEvents.slice(-MAX_APPLIED_EVENTS);
      }
    }

    return applied;
  }

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
      lastSeen: new Date(event.eventTimeMs ?? Date.now()).toISOString(),
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
        lastSeen: new Date(event.eventTimeMs ?? Date.now()).toISOString(),
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
      lastSeen: new Date(event.eventTimeMs ?? Date.now()).toISOString(),
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
        lastSeen: new Date(event.eventTimeMs ?? Date.now()).toISOString(),
      });
    }

    this.updateStats(oldState, newState, false);

    // Track in recentStateChanges
    this.recentStateChanges.unshift(event);
    if (this.recentStateChanges.length > MAX_RECENT_STATE_CHANGES) {
      this.recentStateChanges = this.recentStateChanges.slice(0, MAX_RECENT_STATE_CHANGES);
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

    for (const raw of nodes) {
      const nodeId = (raw.nodeId ?? raw.node_id) as string;
      if (!nodeId) continue;

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
    }

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

    // Decrement old state counter
    if (oldState) {
      this.stats.byState[oldState] = (this.stats.byState[oldState] ?? 0) - 1;
      if (this.stats.byState[oldState] <= 0) {
        delete this.stats.byState[oldState];
      }
      if (oldState === 'active') {
        this.stats.activeNodes--;
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
