/**
 * Delegation Event Emitter (OMN-2284)
 *
 * Emits invalidation events when a new delegation event is projected,
 * allowing the WebSocket server to push DELEGATION_INVALIDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 *
 * Pattern mirrors llm-routing-events.ts: ReadModelConsumer calls
 * emitDelegationInvalidate() after each successful projection, the WebSocket
 * server listens on delegationEventEmitter and broadcasts to clients
 * subscribed to the 'delegation' topic.
 */

import { EventEmitter } from 'events';

export const delegationEventEmitter = new EventEmitter();
// Prevent MaxListenersExceededWarning if the WebSocket setup path is exercised
// multiple times in-process (e.g. during hot-reload or test runs).
delegationEventEmitter.setMaxListeners(20);

/**
 * Notify subscribed clients that a new delegation event has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.task-delegated.v1 or
 * onex.evt.omniclaude.delegation-shadow-comparison.v1 event.
 */
export function emitDelegationInvalidate(correlationId: string): void {
  delegationEventEmitter.emit('delegation-invalidate', { correlationId });
}
