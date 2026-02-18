/**
 * Baselines Event Emitter (OMN-2331)
 *
 * Emits invalidation events when a new baselines snapshot is projected,
 * allowing the WebSocket server to push BASELINES_UPDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 */

import { EventEmitter } from 'events';

export const baselinesEventEmitter = new EventEmitter();
// Prevent MaxListenersExceededWarning if the WebSocket setup path is exercised
// multiple times in-process (e.g. during hot-reload or test runs). Each setup
// call adds a 'baselines-update' listener, so without a raised cap Node.js
// will emit a warning after the default limit of 10 is reached.
baselinesEventEmitter.setMaxListeners(20);

/**
 * Notify subscribed clients that a new baselines snapshot has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omnibase-infra.baselines-computed.v1 event.
 */
export function emitBaselinesUpdate(snapshotId: string): void {
  baselinesEventEmitter.emit('baselines-update', { snapshotId });
}
