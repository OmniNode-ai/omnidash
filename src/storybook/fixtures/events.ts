import type { StreamEvent } from '@/components/dashboard/events/EventStream';

export interface BuildEventStreamOptions {
  /** Override the default mix of source labels. */
  sources?: string[];
  /** Override the default mix of event_type labels. */
  eventTypes?: string[];
  /** RNG seed for deterministic story renders. Default 17. */
  seed?: number;
}

const DEFAULT_SOURCES = [
  'omnimarket',
  'omnibase',
  'omnidash',
  'omninode-runtime',
  'orchestrator',
];
const DEFAULT_EVENT_TYPES = [
  'agent.heartbeat',
  'task.delegated',
  'task.completed',
  'cost.recorded',
  'router.decision',
  'baseline.captured',
  'projection.updated',
];

/**
 * Build a deterministic-ish array of `StreamEvent` rows. Default mix
 * spreads events across 5 sources and 7 event_types so the stream's
 * source-pill colors and `Filter events…` input both have something
 * meaningful to demonstrate.
 */
export function buildEventStream(
  count = 50,
  opts: BuildEventStreamOptions = {},
): StreamEvent[] {
  const sources = opts.sources ?? DEFAULT_SOURCES;
  const eventTypes = opts.eventTypes ?? DEFAULT_EVENT_TYPES;
  let seed = opts.seed ?? 17;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };

  const out: StreamEvent[] = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const eventType = eventTypes[Math.floor(rand() * eventTypes.length)];
    const source = sources[Math.floor(rand() * sources.length)];
    out.push({
      id: `event-${i}`,
      event_type: eventType,
      source,
      // Correlation IDs read like ULIDs in the live stream; keep that
      // shape so the column width budget stays realistic.
      correlation_id: `corr-${(seed >>> 0).toString(16).padStart(8, '0')}-${i}`,
      timestamp: new Date(now - i * 5_000).toISOString(),
    });
  }
  return out;
}
