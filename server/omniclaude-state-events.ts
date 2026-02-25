/**
 * OmniClaude State Event Emitters (OMN-2596 / OMN-2602)
 *
 * Emits invalidation events when new state-change events are projected from
 * the 5 Wave 2 omniclaude Kafka topics, allowing the WebSocket server to push
 * invalidation messages to subscribed dashboard clients so they re-fetch from
 * the real API.
 *
 * Pattern mirrors baselines-events.ts and llm-routing-events.ts:
 * ReadModelConsumer calls the appropriate emit function after each successful
 * projection, the WebSocket server listens on the event emitter and broadcasts
 * to clients subscribed to the relevant topic.
 *
 * Topics covered:
 *   onex.evt.omniclaude.gate-decision.v1        → gate_decisions table
 *   onex.evt.omniclaude.epic-run-updated.v1     → epic_run_lease + epic_run_events tables
 *   onex.evt.omniclaude.pr-watch-updated.v1     → pr_watch_state table
 *   onex.evt.omniclaude.budget-cap-hit.v1       → pipeline_budget_state table
 *   onex.evt.omniclaude.circuit-breaker-tripped.v1 → debug_escalation_counts table
 */

import { EventEmitter } from 'events';

// ============================================================================
// Gate Decision events
// ============================================================================

export const gateDecisionEventEmitter = new EventEmitter();
// setMaxListeners(0) disables the MaxListenersExceededWarning for this
// module-scoped emitter. The listener count is bounded but unpredictable
// (WebSocket setup, hot-reload, test runs). See baselines-events.ts for rationale.
gateDecisionEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that a new gate decision has been projected.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.gate-decision.v1 event.
 */
export function emitGateDecisionInvalidate(correlationId: string): void {
  gateDecisionEventEmitter.emit('gate-decision-invalidate', { correlationId });
}

// ============================================================================
// Epic Run events
// ============================================================================

export const epicRunEventEmitter = new EventEmitter();
epicRunEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that epic run state has changed.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.epic-run-updated.v1 event.
 */
export function emitEpicRunInvalidate(epicRunId: string): void {
  epicRunEventEmitter.emit('epic-run-invalidate', { epicRunId });
}

// ============================================================================
// PR Watch events
// ============================================================================

export const prWatchEventEmitter = new EventEmitter();
prWatchEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that PR watch state has changed.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.pr-watch-updated.v1 event.
 */
export function emitPrWatchInvalidate(correlationId: string): void {
  prWatchEventEmitter.emit('pr-watch-invalidate', { correlationId });
}

// ============================================================================
// Pipeline Budget events
// ============================================================================

export const pipelineBudgetEventEmitter = new EventEmitter();
pipelineBudgetEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that a budget cap has been hit.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.budget-cap-hit.v1 event.
 */
export function emitPipelineBudgetInvalidate(correlationId: string): void {
  pipelineBudgetEventEmitter.emit('pipeline-budget-invalidate', { correlationId });
}

// ============================================================================
// Circuit Breaker / Debug Escalation events
// ============================================================================

export const circuitBreakerEventEmitter = new EventEmitter();
circuitBreakerEventEmitter.setMaxListeners(0);

/**
 * Notify subscribed clients that a circuit breaker has been tripped.
 * Called by ReadModelConsumer after successfully projecting a
 * onex.evt.omniclaude.circuit-breaker-tripped.v1 event.
 */
export function emitCircuitBreakerInvalidate(correlationId: string): void {
  circuitBreakerEventEmitter.emit('circuit-breaker-invalidate', { correlationId });
}
