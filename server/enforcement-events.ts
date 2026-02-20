/**
 * Pattern Enforcement Event Emitter (OMN-2374)
 *
 * Emits invalidation events when a new pattern enforcement event is projected,
 * allowing the WebSocket server to push ENFORCEMENT_INVALIDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 *
 * Pattern mirrors llm-routing-events.ts and enrichment-events.ts:
 * ReadModelConsumer calls emitEnforcementInvalidate() after each successful
 * projection, the WebSocket server listens on enforcementEventEmitter and
 * broadcasts to clients subscribed to the 'enforcement' topic.
 */

import { EventEmitter } from 'events';

export const enforcementEventEmitter = new EventEmitter();
// Prevent MaxListenersExceededWarning if the WebSocket setup path is exercised
// multiple times in-process (e.g. during hot-reload or test runs). Each setup
// call adds an 'enforcement-invalidate' listener, so without a raised cap
// Node.js will emit a warning after the default limit of 10 is reached.
// Listener budget: 1 per setupWebSocket() call + 1 per hot-reload cycle.
// 20 gives 2x headroom without masking genuine listener leaks.
enforcementEventEmitter.setMaxListeners(20);

/**
 * Notify subscribed clients that a new pattern enforcement event has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.pattern-enforcement.v1 event.
 */
export function emitEnforcementInvalidate(correlationId: string): void {
  enforcementEventEmitter.emit('enforcement-invalidate', { correlationId });
}
