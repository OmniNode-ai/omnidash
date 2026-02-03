/**
 * Playback Data Source
 *
 * Lightweight data source for demo playback that works without Kafka.
 * Emits events for WebSocket broadcasting without database storage.
 *
 * Used when EventBusDataSource is unavailable (no Kafka configured).
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
   * Start the playback data source
   * Marks as active and emits connected event
   */
  start(): void {
    this.isActive = true;
    this.emit('connected');
    console.log('[PlaybackDataSource] Started');
  }

  /**
   * Stop the playback data source
   * Marks as inactive and emits disconnected event
   */
  stop(): void {
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
