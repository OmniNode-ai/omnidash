import { z } from 'zod';

// Canonical node state values (shared between client and server)
export const NodeStateSchema = z.enum(['PENDING', 'ACTIVE', 'OFFLINE']);
export type NodeState = z.infer<typeof NodeStateSchema>;

// Canonical dashboard event shape (UI does not see Kafka internals)
export const DashboardEventSchema = z.object({
  topic: z.enum(['registry', 'registry-nodes', 'metrics', 'actions']),
  type: z.string(),
  payload: z.unknown(),
  emitted_at: z.number(), // Unix timestamp ms (pre-parsed)
});
export type DashboardEvent = z.infer<typeof DashboardEventSchema>;

// Specific dashboard event payloads
export const NodeActivatedPayloadSchema = z.object({
  node_id: z.string().uuid(),
  capabilities: z.record(z.string(), z.unknown()),
});
export type NodeActivatedPayload = z.infer<typeof NodeActivatedPayloadSchema>;

export const NodeOfflinePayloadSchema = z.object({
  node_id: z.string().uuid(),
});
export type NodeOfflinePayload = z.infer<typeof NodeOfflinePayloadSchema>;

export const NodeHeartbeatUpdateSchema = z.object({
  node_id: z.string().uuid(),
  last_heartbeat_at: z.number(),
});
export type NodeHeartbeatUpdate = z.infer<typeof NodeHeartbeatUpdateSchema>;

// WebSocket payload schemas (relaxed validation - allow optional fields for partial events)
// Note: Prefixed with "Ws" to distinguish from strict Kafka schemas in event-envelope.ts
export const WsNodeHeartbeatPayloadSchema = z.object({
  node_id: z.string(),
  last_heartbeat_at: z.number().optional(),
});
export type WsNodeHeartbeatPayload = z.infer<typeof WsNodeHeartbeatPayloadSchema>;

export const WsNodeBecameActivePayloadSchema = z.object({
  node_id: z.string(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
});
export type WsNodeBecameActivePayload = z.infer<typeof WsNodeBecameActivePayloadSchema>;

export const WsNodeIntrospectionPayloadSchema = z.object({
  node_id: z.string(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
});
export type WsNodeIntrospectionPayload = z.infer<typeof WsNodeIntrospectionPayloadSchema>;

// WebSocket offline payload (relaxed - no UUID requirement)
export const WsNodeLivenessExpiredPayloadSchema = z.object({
  node_id: z.string(),
});
export type WsNodeLivenessExpiredPayload = z.infer<typeof WsNodeLivenessExpiredPayloadSchema>;

// Projected node state (what the dashboard maintains)
export const ProjectedNodeSchema = z.object({
  node_id: z.string().uuid(),
  state: NodeStateSchema,
  capabilities: z.record(z.string(), z.unknown()).optional(),
  activated_at: z.number().optional(),
  last_heartbeat_at: z.number().optional(),
  last_event_at: z.number(),
  offline_at: z.number().optional(),
});
export type ProjectedNode = z.infer<typeof ProjectedNodeSchema>;

// Health status derived from heartbeat recency
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

// State filter constants (for visibility toggles)
// Supports both canonical states (PENDING, ACTIVE, OFFLINE) and legacy API states
// (REJECTED, LIVENESS_EXPIRED, etc.) for backward compatibility
export const OFFLINE_STATES = ['OFFLINE', 'REJECTED', 'LIVENESS_EXPIRED', 'ACK_TIMED_OUT'] as const;
export const PENDING_STATES = [
  'PENDING',
  'PENDING_REGISTRATION',
  'AWAITING_ACK',
  'ACCEPTED',
  'ACK_RECEIVED',
] as const;

export type OfflineState = (typeof OFFLINE_STATES)[number];
export type PendingState = (typeof PENDING_STATES)[number];

export function isOfflineState(state: string): state is OfflineState {
  return (OFFLINE_STATES as readonly string[]).includes(state);
}

export function isPendingState(state: string): state is PendingState {
  return (PENDING_STATES as readonly string[]).includes(state);
}

export const HEALTH_THRESHOLDS = {
  GREEN_MAX_AGE_MS: 30_000, // Last heartbeat within 30s
  YELLOW_MAX_AGE_MS: 60_000, // Last heartbeat within 60s
} as const;

export function computeHealthStatus(node: ProjectedNode): HealthStatus {
  if (node.state === 'OFFLINE') return 'unhealthy';
  if (node.state === 'PENDING') return 'unknown';
  if (!node.last_heartbeat_at) return 'unknown';

  const age = Date.now() - node.last_heartbeat_at;
  if (age <= HEALTH_THRESHOLDS.GREEN_MAX_AGE_MS) return 'healthy';
  if (age <= HEALTH_THRESHOLDS.YELLOW_MAX_AGE_MS) return 'degraded';
  return 'unhealthy';
}
