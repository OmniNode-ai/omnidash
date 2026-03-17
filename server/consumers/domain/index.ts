/**
 * Domain handler registry [OMN-5191]
 *
 * Central registry that exports all domain handlers and provides
 * a factory function to create the handler set used by EventConsumer.
 *
 * The EventConsumer's message routing loop iterates this list and
 * delegates to the first handler whose canHandle() returns true.
 */

export { OmniclaudeHandler } from './omniclaude-handler';
export { OmniintelligenceHandler } from './omniintelligence-handler';
export { OmnimemoryHandler } from './omnimemory-handler';
export { OmnibaseInfraHandler } from './omnibase-infra-handler';
export { PlatformHandler } from './platform-handler';

// Re-export types for consumer and downstream use
export type {
  DomainHandler,
  ConsumerContext,
  AgentMetrics,
  AgentAction,
  RoutingDecision,
  TransformationEvent,
  RegisteredNode,
  NodeType,
  RegistrationState,
  IntrospectionReason,
  OnexNodeState,
  CanonicalOnexNode,
  NodeIntrospectionEvent,
  NodeHeartbeatEvent,
  NodeStateChangeEvent,
  InternalIntentClassifiedEvent,
  RawRoutingDecisionEvent,
  RawAgentActionEvent,
  RawTransformationEvent,
  RawPerformanceMetricEvent,
  RawNodeIntrospectionEvent,
  RawNodeHeartbeatEvent,
  RawNodeStateChangeEvent,
  RawIntentClassifiedEvent,
  RawIntentStoredEvent,
  RawIntentQueryResponseEvent,
} from './types';

// Re-export utilities
export {
  intentLogger,
  currentLogLevel,
  sanitizeTimestamp,
  parseNodeType,
  parseRegistrationState,
  parseIntrospectionReason,
  normalizeActionFields,
} from './consumer-utils';

import type { DomainHandler } from './types';
import { OmniclaudeHandler } from './omniclaude-handler';
import { OmniintelligenceHandler } from './omniintelligence-handler';
import { OmnimemoryHandler } from './omnimemory-handler';
import { OmnibaseInfraHandler } from './omnibase-infra-handler';
import { PlatformHandler } from './platform-handler';

/**
 * Create the complete set of domain handlers.
 *
 * Order matters: handlers are checked in registration order.
 * More specific handlers (omniclaude, omniintelligence) come first;
 * the platform handler is a catch-all for cross-cutting topics.
 */
export function createDomainHandlers(): DomainHandler[] {
  return [
    new OmniclaudeHandler(),
    new OmniintelligenceHandler(),
    new OmnimemoryHandler(),
    new OmnibaseInfraHandler(),
    new PlatformHandler(),
  ];
}
