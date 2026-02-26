import { z } from 'zod';

// ONEX Event Envelope (wraps all Kafka events)
//
// The producer (ModelEventEnvelope in omnibase_core) serializes envelopes with
// `envelope_id` + `envelope_timestamp`, while omnidash historically expected
// `entity_id` + `emitted_at`. We accept BOTH field names and normalize to the
// canonical consumer-side names (entity_id, emitted_at) via .transform().
const RawEventEnvelopeSchema = z.object({
  // Accept either field name for the envelope identifier
  entity_id: z.string().uuid().optional(),
  envelope_id: z.string().uuid().optional(),
  correlation_id: z.string().uuid(),
  causation_id: z.string().uuid().optional(),
  // Accept either field name for the timestamp
  emitted_at: z.string().datetime().optional(),
  envelope_timestamp: z.string().datetime().optional(),
  payload: z.unknown(),
}).refine(
  (data) => Boolean(data.entity_id || data.envelope_id),
  { message: 'Either entity_id or envelope_id is required' }
).refine(
  (data) => Boolean(data.emitted_at || data.envelope_timestamp),
  { message: 'Either emitted_at or envelope_timestamp is required' }
);

export const EventEnvelopeSchema = RawEventEnvelopeSchema.transform((data) => ({
  entity_id: (data.entity_id || data.envelope_id)!,
  correlation_id: data.correlation_id,
  causation_id: data.causation_id,
  emitted_at: (data.emitted_at || data.envelope_timestamp)!,
  payload: data.payload,
}));

export type EventEnvelope<T> = {
  entity_id: string;
  correlation_id: string;
  causation_id?: string;
  emitted_at: string;
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
