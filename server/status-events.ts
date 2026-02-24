/**
 * Status Event Emitter (OMN-2658)
 *
 * Emits invalidation events when a new status event is projected,
 * allowing the WebSocket server to push STATUS_INVALIDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 *
 * Pattern mirrors delegation-events.ts: event-consumer.ts calls
 * emitStatusInvalidate() after each successful projection, the WebSocket
 * server listens on statusEventEmitter and broadcasts to clients
 * subscribed to the 'status' topic.
 */

import { EventEmitter } from 'events';

export const statusEventEmitter = new EventEmitter();
// Prevent MaxListenersExceededWarning during hot-reload or test runs.
statusEventEmitter.setMaxListeners(20);

/**
 * Notify subscribed clients that a new status event has been projected.
 * Called by event-consumer.ts after successfully projecting one of:
 *   onex.evt.github.pr-status.v1
 *   onex.evt.git.hook.v1
 *   onex.evt.linear.snapshot.v1
 */
export function emitStatusInvalidate(source: 'pr' | 'hook' | 'linear'): void {
  statusEventEmitter.emit('status-invalidate', { source, timestamp: Date.now() });
}
