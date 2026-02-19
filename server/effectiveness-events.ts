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
// Disable the MaxListenersExceededWarning entirely for this module-scoped emitter.
// The listener count is bounded but unpredictable (WebSocket setup, hot-reload,
// test runs), and any arbitrary numeric cap can still trigger the warning.
// setMaxListeners(0) is the correct choice for module-scoped emitters where the
// listener count is managed by the module itself rather than external callers.
effectivenessEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that effectiveness data has changed.
 * Call this when injection_effectiveness or latency_breakdowns rows
 * are projected into the omnidash_analytics database.
 */
export function emitEffectivenessUpdate(): void {
  effectivenessEventEmitter.emit('effectiveness-update');
}
