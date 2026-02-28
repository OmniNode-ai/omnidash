import { z } from 'zod';

// ONEX Event Envelope (wraps all Kafka events)
//
// Canonical field names (from omnibase_core ModelEventEnvelope):
//   envelope_id         — unique envelope identifier (UUID)
//   envelope_timestamp  — envelope creation timestamp (ISO-8601 UTC)
//
// The dual naming convention (entity_id / emitted_at vs envelope_id /
// envelope_timestamp) has been resolved: `envelope_id` and
// `envelope_timestamp` are the authoritative names.  This schema accepts
// legacy `entity_id` / `emitted_at` during transition and normalises them
// to the canonical names so all consumers see a single shape.
const RawEventEnvelopeSchema = z
  .object({
    // Canonical: envelope_id (legacy alias: entity_id)
    envelope_id: z.string().uuid().optional(),
    entity_id: z.string().uuid().optional(),
    correlation_id: z.string().uuid(),
    causation_id: z.string().uuid().optional(),
    // Canonical: envelope_timestamp (legacy alias: emitted_at)
    envelope_timestamp: z.string().datetime().optional(),
    emitted_at: z.string().datetime().optional(),
    payload: z.unknown(),
  })
  .refine((data) => Boolean(data.envelope_id || data.entity_id), {
    message: 'envelope_id is required (legacy alias entity_id also accepted)',
  })
  .refine((data) => Boolean(data.envelope_timestamp || data.emitted_at), {
    message: 'envelope_timestamp is required (legacy alias emitted_at also accepted)',
  });

export const EventEnvelopeSchema = RawEventEnvelopeSchema.transform((data) => ({
  envelope_id: (data.envelope_id || data.entity_id)!,
  correlation_id: data.correlation_id,
  causation_id: data.causation_id,
  envelope_timestamp: (data.envelope_timestamp || data.emitted_at)!,
  payload: data.payload,
}));

export type EventEnvelope<T> = {
  envelope_id: string;
  correlation_id: string;
  causation_id?: string;
  envelope_timestamp: string;
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
