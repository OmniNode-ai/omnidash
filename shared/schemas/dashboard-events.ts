import { z } from 'zod';

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

// Projected node state (what the dashboard maintains)
export const ProjectedNodeSchema = z.object({
  node_id: z.string().uuid(),
  state: z.enum(['PENDING', 'ACTIVE', 'OFFLINE']),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  activated_at: z.number().optional(),
  last_heartbeat_at: z.number().optional(),
  last_event_at: z.number(),
  offline_at: z.number().optional(),
});
export type ProjectedNode = z.infer<typeof ProjectedNodeSchema>;

// Health status derived from heartbeat recency
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

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
