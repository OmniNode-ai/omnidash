/**
 * Single source of truth for Kafka broker resolution in omnidash.
 *
 * Precedence (highest → lowest):
 *   1. KAFKA_BOOTSTRAP_SERVERS  (platform standard — use this)
 *   2. KAFKA_BROKERS            (legacy alias — deprecated, accepted for compatibility)
 *
 * All server modules MUST import `resolveBrokers()` from this file.
 * Never read KAFKA_BROKERS / KAFKA_BOOTSTRAP_SERVERS directly in other modules.
 *
 * Bus modes inferred from broker address:
 *   local   — localhost:19092 (local Docker Redpanda; start with `infra-up`)
 *   cloud   — localhost:29092 (cloud bus launchd tunnel → k8s Redpanda)
 *   unknown — anything else (k8s pod-internal address, custom host, CI broker, etc.)
 *
 * Callsite audit (2026-03-12, OMN-4747):
 *   WRONG order (KAFKA_BROKERS first — legacy-first, allows old var to shadow standard):
 *     server/read-model-consumer.ts:323
 *     server/service-health.ts:101
 *     server/topic-catalog-manager.ts:162
 *     server/event-bus-data-source.ts:139,177
 *     server/index.ts:271,288,396
 *     server/test/mock-event-generator.ts:169,190
 *   CORRECT order (KAFKA_BOOTSTRAP_SERVERS first):
 *     server/event-consumer.ts:969,1082
 *     server/intelligence-event-adapter.ts:87
 *   All 11 production callsites replaced by this module (OMN-4749).
 */

export type BusMode = 'local' | 'cloud' | 'unknown';

/**
 * Infer bus mode from a single broker address string.
 * Exported for testing and startup banner use.
 */
export function getBusMode(brokerString: string): BusMode {
  if (brokerString.includes(':19092')) return 'local';
  if (brokerString.includes(':29092')) return 'cloud';
  return 'unknown';
}

/**
 * Resolve the configured Kafka brokers as a string array.
 *
 * KAFKA_BOOTSTRAP_SERVERS takes precedence over KAFKA_BROKERS.
 * Throws if neither is set — Kafka is required infrastructure.
 */
export function resolveBrokers(): string[] {
  const raw = process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKERS;
  if (!raw) {
    throw new Error(
      'KAFKA_BOOTSTRAP_SERVERS is not set. ' +
        'Set it in .env or run `npm run dev:local` (local bus) / `npm run dev:cloud` (cloud bus). ' +
        'Local bus: localhost:19092 | Cloud bus: localhost:29092'
    );
  }
  return raw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Convenience: resolve brokers and return the raw joined string (for logging).
 * Returns 'not configured' if neither var is set (never throws).
 */
export function getBrokerString(): string {
  return process.env.KAFKA_BOOTSTRAP_SERVERS || process.env.KAFKA_BROKERS || 'not configured';
}

/**
 * Infer bus mode from the current environment.
 * Returns 'unknown' when brokers are not configured.
 */
export function getCurrentBusMode(): BusMode {
  const brokerStr = getBrokerString();
  if (brokerStr === 'not configured') return 'unknown';
  return getBusMode(brokerStr);
}
