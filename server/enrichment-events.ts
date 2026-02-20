/**
 * Context Enrichment Event Emitter (OMN-2373)
 *
 * Emits invalidation events when a new context enrichment event is projected,
 * allowing the WebSocket server to push ENRICHMENT_INVALIDATE to subscribed
 * dashboard clients so they re-fetch from the real API.
 *
 * Pattern mirrors llm-routing-events.ts and delegation-events.ts:
 * ReadModelConsumer calls emitEnrichmentInvalidate() after each successful
 * projection, the WebSocket server listens on enrichmentEventEmitter and
 * broadcasts to clients subscribed to the 'enrichment' topic.
 */

import { EventEmitter } from 'events';

export const enrichmentEventEmitter = new EventEmitter();
// Prevent MaxListenersExceededWarning if the WebSocket setup path is exercised
// multiple times in-process (e.g. during hot-reload or test runs). Each setup
// call adds an 'enrichment-invalidate' listener, so without a raised cap
// Node.js will emit a warning after the default limit of 10 is reached.
enrichmentEventEmitter.setMaxListeners(20);

/**
 * Notify subscribed clients that a new context enrichment event has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.context-enrichment.v1 event.
 */
export function emitEnrichmentInvalidate(correlationId: string): void {
  enrichmentEventEmitter.emit('enrichment-invalidate', { correlationId });
}
