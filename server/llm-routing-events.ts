/**
 * LLM Routing Event Emitter (OMN-2279)
 *
 * Emits invalidation events when a new LLM routing decision is projected,
 * allowing the WebSocket server to push LLM_ROUTING_INVALIDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 *
 * Pattern mirrors baselines-events.ts: ReadModelConsumer calls
 * emitLlmRoutingInvalidate() after each successful projection, the WebSocket
 * server listens on llmRoutingEventEmitter and broadcasts to clients
 * subscribed to the 'llm-routing' topic.
 */

import { EventEmitter } from 'events';

export const llmRoutingEventEmitter = new EventEmitter();
// Prevent MaxListenersExceededWarning if the WebSocket setup path is exercised
// multiple times in-process (e.g. during hot-reload or test runs). Each setup
// call adds an 'llm-routing-invalidate' listener, so without a raised cap
// Node.js will emit a warning after the default limit of 10 is reached.
llmRoutingEventEmitter.setMaxListeners(20);

/**
 * Notify subscribed clients that a new LLM routing decision has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.llm-routing-decision.v1 event.
 */
export function emitLlmRoutingInvalidate(correlationId: string): void {
  llmRoutingEventEmitter.emit('llm-routing-invalidate', { correlationId });
}
