/**
 * Baselines Event Emitter (OMN-2331)
 *
 * Emits invalidation events when a new baselines snapshot is projected,
 * allowing the WebSocket server to push BASELINES_UPDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 */

import { EventEmitter } from 'events';

export const baselinesEventEmitter = new EventEmitter();
// Disable the MaxListenersExceededWarning entirely for this module-scoped emitter.
// The listener count is bounded but unpredictable (WebSocket setup, hot-reload,
// test runs), and any arbitrary numeric cap can still trigger the warning.
// setMaxListeners(0) is the correct choice for module-scoped emitters where the
// listener count is managed by the module itself rather than external callers.
baselinesEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that a new baselines snapshot has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omnibase-infra.baselines-computed.v1 event.
 */
export function emitBaselinesUpdate(snapshotId: string): void {
  baselinesEventEmitter.emit('baselines-update', { snapshotId });
}
