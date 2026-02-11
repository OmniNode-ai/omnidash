/**
 * ProjectionService — Core Projection Orchestrator (OMN-2094)
 *
 * Owns ingestSeq assignment, event routing to registered views, and
 * invalidation emission. Sits between EventConsumer/EventBusDataSource
 * and the WebSocket/Express layers.
 *
 * Architecture:
 * - EventConsumer/EventBusDataSource emit raw events
 * - ProjectionService wraps them in ProjectionEvent (with ingestSeq)
 * - Routes to all registered ProjectionView instances
 * - Each view maintains its own MonotonicMergeTracker (single key)
 * - Emits 'projection-invalidate' after view state changes
 *
 * Sort key: (event_time_ms DESC, ingest_seq DESC) — universal
 * Cursor: max(ingest_seq) in buffer
 */

import { EventEmitter } from 'events';
import { extractEventTimeMs, MISSING_TIMESTAMP_SENTINEL_MS } from './monotonic-merge';

// ============================================================================
// Contracts (locked per OMN-2094) — canonical types live in @shared/projection-types
// ============================================================================

export type {
  ProjectionEvent,
  ProjectionResponse,
  ProjectionEventsResponse,
} from '@shared/projection-types';

import type {
  ProjectionEvent,
  ProjectionResponse,
  ProjectionEventsResponse,
} from '@shared/projection-types';

// ============================================================================
// ProjectionView interface
// ============================================================================

/**
 * Interface that all projection views must implement.
 *
 * Each view is a materialized, queryable slice of the event stream.
 * Views receive pre-sequenced ProjectionEvents and maintain their own
 * internal state. The ProjectionService handles routing; views handle
 * domain logic.
 *
 * @template TPayload - The shape of the view's snapshot payload
 */
export interface ProjectionView<TPayload> {
  /** Unique identifier for this view (e.g. 'event-bus', 'intent', 'node-registry') */
  viewId: string;

  /**
   * Get a snapshot of the view's current materialized state.
   *
   * @param options.limit - Max number of items to return (view-specific semantics)
   */
  getSnapshot(options?: { limit?: number }): ProjectionResponse<TPayload>;

  /**
   * Get events applied to this view since the given cursor position.
   * Used for incremental updates (e.g. WebSocket clients catching up).
   *
   * @param cursor - ingestSeq to start from (exclusive)
   * @param limit  - Max events to return
   */
  getEventsSince(cursor: number, limit?: number): ProjectionEventsResponse;

  /**
   * Apply a projection event to this view's internal state.
   * Called by ProjectionService for every event that passes routing.
   * The view decides whether the event is relevant to its domain.
   *
   * @returns true if the event was applied (state changed), false if ignored
   */
  applyEvent(event: ProjectionEvent): boolean;

  /** Reset view state (used for demo mode resets, testing) */
  reset(): void;
}

// ============================================================================
// ProjectionService
// ============================================================================

/** Options for initializing the ProjectionService */
export interface ProjectionServiceOptions {
  /** Initial ingestSeq value (typically max(event_bus_events.id) + 1 from DB preload) */
  initialSeq?: number;
}

/**
 * Core projection orchestrator.
 *
 * Responsibilities:
 * 1. Assign monotonically increasing ingestSeq to every incoming event
 * 2. Wrap raw events into ProjectionEvent shape
 * 3. Route events to all registered views
 * 4. Emit 'projection-invalidate' when a view's state changes
 *
 * Events emitted:
 * - 'projection-invalidate': { viewId: string, cursor: number }
 *   Fired after a view successfully applies an event. Downstream
 *   consumers (WebSocket server) listen for this to push updates.
 * - 'projection-reset': { newSeq: number }
 *   Fired after reset() rewinds the sequence counter. Downstream
 *   consumers should discard held cursors.
 */
export class ProjectionService extends EventEmitter {
  private ingestSeqCounter: number;
  private views: Map<string, ProjectionView<unknown>>;

  constructor(options?: ProjectionServiceOptions) {
    super();
    this.setMaxListeners(50);
    this.ingestSeqCounter = options?.initialSeq ?? 1;
    this.views = new Map();
  }

  // --------------------------------------------------------------------------
  // Sequence assignment
  // --------------------------------------------------------------------------

  /**
   * Assign the next ingestSeq. Each call returns a unique, monotonically
   * increasing integer. Thread-safe in single-threaded Node.js runtime.
   *
   * Note: uses JS Number counter; safe up to Number.MAX_SAFE_INTEGER
   * (~9 quadrillion). Not a practical concern at dashboard event rates.
   */
  private assignSeq(): number {
    return this.ingestSeqCounter++;
  }

  /** Current sequence counter value (next seq to be assigned). */
  get currentSeq(): number {
    return this.ingestSeqCounter;
  }

  // --------------------------------------------------------------------------
  // View registration
  // --------------------------------------------------------------------------

  /**
   * Register a projection view. Duplicate viewIds are rejected.
   */
  registerView<T>(view: ProjectionView<T>): void {
    if (this.views.has(view.viewId)) {
      throw new Error(`ProjectionView "${view.viewId}" is already registered`);
    }
    this.views.set(view.viewId, view as ProjectionView<unknown>);
  }

  /**
   * Unregister a projection view by viewId.
   * @returns true if the view was found and removed
   */
  unregisterView(viewId: string): boolean {
    return this.views.delete(viewId);
  }

  /** Get a registered view by ID. */
  getView<T>(viewId: string): ProjectionView<T> | undefined {
    return this.views.get(viewId) as ProjectionView<T> | undefined;
  }

  /** List all registered view IDs. */
  get viewIds(): string[] {
    return Array.from(this.views.keys());
  }

  // --------------------------------------------------------------------------
  // Event ingestion
  // --------------------------------------------------------------------------

  /**
   * Ingest a raw event: assign ingestSeq, wrap as ProjectionEvent,
   * route to all registered views.
   *
   * This is the main entry point. EventConsumer and EventBusDataSource
   * call this for each incoming event.
   *
   * @param raw - Raw event data from Kafka or DB preload
   * @returns The wrapped ProjectionEvent (useful for testing/chaining)
   */
  ingest(raw: RawEventInput): ProjectionEvent {
    const ingestSeq = this.assignSeq();
    // Safe on untrusted payload: extractEventTimeMs returns sentinel for invalid input
    const eventTimeMs = raw.eventTimeMs ?? extractEventTimeMs(raw.payload ?? {});

    const eventTimeMissing =
      raw.eventTimeMs == null && eventTimeMs === MISSING_TIMESTAMP_SENTINEL_MS;

    const projectionEvent: ProjectionEvent = {
      id: raw.id ?? `proj-${ingestSeq}`,
      eventTimeMs,
      ingestSeq,
      topic: raw.topic ?? '',
      type: raw.type ?? raw.topic ?? 'unknown',
      source: raw.source ?? '',
      severity: raw.severity ?? 'info',
      payload: raw.payload ?? {},
      ...(eventTimeMissing && { eventTimeMissing: true }),
      error: raw.error,
    };

    this.routeToViews(projectionEvent);
    return projectionEvent;
  }

  /**
   * Ingest a batch of raw events. Each gets its own ingestSeq.
   * Useful for DB preload replay.
   */
  ingestBatch(events: RawEventInput[]): ProjectionEvent[] {
    return events.map((raw) => this.ingest(raw));
  }

  // --------------------------------------------------------------------------
  // Event routing
  // --------------------------------------------------------------------------

  /**
   * Route a ProjectionEvent to all registered views.
   * Emits 'projection-invalidate' for each view that applies the event.
   */
  private routeToViews(event: ProjectionEvent): void {
    for (const view of this.views.values()) {
      try {
        const applied = view.applyEvent(event);
        if (applied) {
          this.emit('projection-invalidate', {
            viewId: view.viewId,
            cursor: event.ingestSeq,
          });
        }
      } catch (err) {
        console.error(
          `[projection] View "${view.viewId}" threw during applyEvent for seq=${event.ingestSeq}:`,
          err
        );
        this.emit('projection-error', {
          viewId: view.viewId,
          ingestSeq: event.ingestSeq,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Reset all views and the sequence counter.
   * Used for demo mode resets and testing.
   */
  reset(newInitialSeq?: number): void {
    for (const view of this.views.values()) {
      try {
        view.reset();
      } catch (err) {
        console.error(`[projection] View "${view.viewId}" threw during reset:`, err);
      }
    }
    this.ingestSeqCounter = newInitialSeq ?? 1;
    this.emit('projection-reset', { newSeq: this.ingestSeqCounter });
  }

  /** Number of registered views. */
  get viewCount(): number {
    return this.views.size;
  }
}

// ============================================================================
// Raw event input (flexible shape accepted by ingest())
// ============================================================================

/**
 * Flexible input shape for ingest(). Callers provide whatever fields
 * are available; ProjectionService fills in defaults.
 */
export interface RawEventInput {
  id?: string;
  eventTimeMs?: number;
  topic?: string;
  type?: string;
  source?: string;
  severity?: ProjectionEvent['severity'];
  payload?: Record<string, unknown>;
  error?: { message: string; stack?: string };
}
