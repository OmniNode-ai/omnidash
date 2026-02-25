// WebSocket
export { useWebSocket } from './useWebSocket';

// Intent Stream
export { useIntentStream } from './useIntentStream';
export type {
  UseIntentStreamOptions,
  UseIntentStreamReturn,
  ProcessedIntent,
  IntentEventType,
} from './useIntentStream';

// Projection Stream (OMN-2095 — TanStack Query + WS invalidation)
export { useProjectionStream } from './useProjectionStream';
export type { UseProjectionStreamOptions, UseProjectionStreamReturn } from './useProjectionStream';

// Intent Projection Stream (OMN-2096 — manual fetch + WS invalidation)
export { useIntentProjectionStream } from './useIntentProjectionStream';
export type {
  ProjectionSnapshot,
  UseIntentProjectionStreamOptions,
  UseIntentProjectionStreamReturn,
} from './useIntentProjectionStream';
