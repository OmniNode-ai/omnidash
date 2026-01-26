/**
 * Shared constants for cleanup timing across client and server.
 *
 * These constants ensure consistent behavior for node cleanup
 * in both the WebSocket client (useRegistryWebSocket) and the
 * Kafka event consumer (event-consumer.ts).
 *
 * Part of OMN-1279: Contract-Driven Dashboard - Live Bus Subscription
 */

/**
 * Time in milliseconds after which an OFFLINE node is eligible for cleanup.
 * Nodes that have been offline for longer than this duration will be removed
 * from the projectedNodes Map to prevent unbounded memory growth.
 *
 * @default 300000 (5 minutes)
 */
export const OFFLINE_NODE_TTL_MS = 300_000;

/**
 * Interval in milliseconds for running the offline node cleanup check.
 * The cleanup effect runs periodically at this interval to remove stale
 * offline nodes from memory.
 *
 * @default 60000 (1 minute)
 */
export const CLEANUP_INTERVAL_MS = 60_000;
