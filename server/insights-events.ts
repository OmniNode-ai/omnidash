/**
 * Insights Event Emitter
 *
 * Emits invalidation events when learned insights data changes,
 * allowing the WebSocket server to push real-time updates to
 * subscribed dashboard clients.
 *
 * @see OMN-2306 - Connect Learned Insights page to OmniMemory API
 */

import { EventEmitter } from 'events';

export const insightsEventEmitter = new EventEmitter();

/**
 * Notify subscribed clients that insights data has changed.
 * Call this when new learned_patterns are projected into the database.
 */
export function emitInsightsUpdate(): void {
  insightsEventEmitter.emit('insights-update');
}
