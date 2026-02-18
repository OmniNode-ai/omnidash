/**
 * Effectiveness Event Emitter
 *
 * Emits invalidation events when injection effectiveness data changes,
 * allowing the WebSocket server to push EFFECTIVENESS_UPDATE messages
 * to subscribed dashboard clients.
 *
 * @see OMN-2328 - Wire real effectiveness data to dashboard pages
 */

import { EventEmitter } from 'events';

export const effectivenessEventEmitter = new EventEmitter();

/**
 * Notify subscribed clients that effectiveness data has changed.
 * Call this when injection_effectiveness or latency_breakdowns rows
 * are projected into the omnidash_analytics database.
 */
export function emitEffectivenessUpdate(): void {
  effectivenessEventEmitter.emit('effectiveness-update');
}
