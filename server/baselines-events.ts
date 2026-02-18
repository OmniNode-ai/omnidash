/**
 * Baselines Event Emitter (OMN-2331)
 *
 * Emits invalidation events when a new baselines snapshot is projected,
 * allowing the WebSocket server to push BASELINES_UPDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 */

import { EventEmitter } from 'events';

export const baselinesEventEmitter = new EventEmitter();

/**
 * Notify subscribed clients that a new baselines snapshot has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omnibase-infra.baselines-computed.v1 event.
 */
export function emitBaselinesUpdate(snapshotId: string): void {
  baselinesEventEmitter.emit('baselines-update', { snapshotId });
}
