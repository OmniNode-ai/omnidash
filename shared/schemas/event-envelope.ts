import { z } from 'zod';

// ONEX Event Envelope (wraps all Kafka events)
export const EventEnvelopeSchema = z.object({
  entity_id: z.string().uuid(),
  correlation_id: z.string().uuid(),
  causation_id: z.string().uuid().optional(),
  emitted_at: z.string().datetime(),
  payload: z.unknown(),
});

export type EventEnvelope<T> = Omit<z.infer<typeof EventEnvelopeSchema>, 'payload'> & {
  payload: T;
};

// Node capabilities - generic, not hardcoded flags
export const NodeCapabilitiesSchema = z.record(z.string(), z.unknown());
export type NodeCapabilities = z.infer<typeof NodeCapabilitiesSchema>;

// node-became-active payload
export const NodeBecameActivePayloadSchema = z.object({
  node_id: z.string().uuid(),
  capabilities: NodeCapabilitiesSchema,
});
export type NodeBecameActivePayload = z.infer<typeof NodeBecameActivePayloadSchema>;

// node-heartbeat payload
export const NodeHeartbeatPayloadSchema = z.object({
  node_id: z.string().uuid(),
  uptime_seconds: z.number().optional(),
  memory_usage_mb: z.number().optional(),
  cpu_usage_percent: z.number().optional(),
  active_operations_count: z.number().optional(),
});
export type NodeHeartbeatPayload = z.infer<typeof NodeHeartbeatPayloadSchema>;

// node-liveness-expired payload
export const NodeLivenessExpiredPayloadSchema = z.object({
  node_id: z.string().uuid(),
  last_heartbeat_at: z.string().datetime().nullable(),
});
export type NodeLivenessExpiredPayload = z.infer<typeof NodeLivenessExpiredPayloadSchema>;

// node-introspection payload
export const NodeIntrospectionPayloadSchema = z.object({
  node_id: z.string().uuid(),
  node_type: z.string().optional(),
  node_version: z.string().optional(),
  capabilities: NodeCapabilitiesSchema.optional(),
});
export type NodeIntrospectionPayload = z.infer<typeof NodeIntrospectionPayloadSchema>;
