/**
 * Playback Data Source
 *
 * Lightweight data source for demo/recording playback. Replays pre-recorded
 * event sequences for stakeholder demos and offline UI review. It does not
 * replace the live Kafka pipeline — Kafka/Redpanda is required infrastructure
 * for all non-demo operation.
 *
 * This class should only be active when the user has explicitly enabled demo
 * mode (e.g., `?demo=true` URL parameter or the demo toggle). It must NOT
 * be used as a fallback when Kafka is unreachable.
 *
 * Events emitted:
 * - 'event': When new event is injected (EventBusEvent)
 * - 'connected': When playback source is started
 * - 'disconnected': When playback source is stopped
 */

import { EventEmitter } from 'events';
import type { EventBusEvent } from './event-bus-data-source';

export class PlaybackDataSource extends EventEmitter {
  private isActive = false;

  constructor() {
    super();
  }

  /**
   * Inject event for real-time streaming (no database storage)
   * Emits 'event' that websocket.ts listens to
   */
  injectEvent(event: EventBusEvent): void {
    this.emit('event', event);
  }

  /**
   * Transform recorded playback event to EventBusEvent format
   * Handles the conversion from playback recording format to the normalized event envelope
   */
  injectPlaybackEvent(topic: string, value: Record<string, unknown>): void {
    const event: EventBusEvent = {
      event_type: (value.actionType as string) || topic,
      event_id:
        (value.id as string) || `playback-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: (value.createdAt as string) || new Date().toISOString(),
      tenant_id: 'playback',
      namespace: 'demo',
      source: 'playback-service',
      correlation_id: value.correlationId as string,
      schema_ref: '',
      payload: value,
      topic,
      partition: 0,
      offset: '0',
      processed_at: new Date(),
    };
    this.injectEvent(event);
  }

  /**
   * Start the playback data source.
   * Marks as active and emits connected event.
   *
   * Idempotency: if the source is already active, this method returns early
   * without error and without re-emitting 'connected'. A `console.warn` is
   * issued as an informational no-op notice — callers must not rely on it
   * programmatically (no thrown error, no return value). The method is
   * effectively idempotent and is safe to call from cleanup or setup paths
   * where the active state is uncertain (e.g., graceful restart scenarios).
   *
   * NOTE: Must only be called when demo mode is explicitly enabled by the user
   * (e.g., via `?demo=true` URL parameter or the global demo toggle). Callers
   * are responsible for enforcing this guard — this class does not verify
   * demo mode internally. The guard is enforced at the HTTP layer: the
   * `POST /api/demo/start` handler in `server/playback-routes.ts` is the
   * sole call site that starts demo playback, and it is only reachable when
   * the user explicitly triggers a recording playback from the dashboard.
   * Starting playback outside of explicit demo mode violates the contract
   * described in the module JSDoc.
   */
  start(): void {
    if (this.isActive) {
      console.warn('[PlaybackDataSource] start() called while already active — no-op');
      return;
    }
    this.isActive = true;
    this.emit('connected');
    console.log('[PlaybackDataSource] Started');
  }

  /**
   * Stop the playback data source.
   * Marks as inactive and emits disconnected event.
   * No-ops if the source is not currently active.
   */
  stop(): void {
    if (!this.isActive) {
      return; // Never started — no-op (expected on clean shutdown when demo mode was never activated)
    }
    this.isActive = false;
    this.emit('disconnected');
    console.log('[PlaybackDataSource] Stopped');
  }

  /**
   * Check if playback data source is running
   */
  isRunning(): boolean {
    return this.isActive;
  }
}

// ============================================================================
// Singleton Pattern
// ============================================================================

let playbackDataSourceInstance: PlaybackDataSource | null = null;

/**
 * Get PlaybackDataSource singleton instance
 * Creates instance on first call, returns existing instance on subsequent calls
 */
export function getPlaybackDataSource(): PlaybackDataSource {
  if (!playbackDataSourceInstance) {
    playbackDataSourceInstance = new PlaybackDataSource();
  }
  return playbackDataSourceInstance;
}

/**
 * Check if PlaybackDataSource is available and running
 */
export function isPlaybackDataSourceActive(): boolean {
  return playbackDataSourceInstance?.isRunning() ?? false;
}
