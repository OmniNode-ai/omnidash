/** Fixture factory for LiveEventStreamWidget stories. */

interface LiveEvent {
  id: string;
  type: string;
  timestamp: string;
  source: string;
  topic: string;
  summary: string;
  payload: string;
}

const EVENT_TYPES = ['ROUTING', 'ACTION', 'TRANSFORMATION', 'ERROR'];
const SOURCES = ['omnimarket', 'omninode-runtime', 'omniclaude', 'omnibase-infra', 'omnimemory'];
const TOPICS_POOL = [
  'onex.cmd.delegation.route.v1',
  'onex.evt.node.completed.v1',
  'onex.evt.pipeline.started.v1',
  'onex.cmd.transform.apply.v1',
  'onex.evt.error.unhandled.v1',
];
const SUMMARIES = [
  'Routing decision for code_generation task',
  'Node execution completed successfully',
  'Pipeline stage transformation applied',
  'Delegation metrics updated',
  'Error: connection timeout to Kafka broker',
  'Intent classification completed',
  'Schema validation passed',
  'Cost aggregation snapshot emitted',
  'Worker heartbeat received',
  'Quality gate evaluation triggered',
];

/**
 * Build N live events spread across the last hour.
 */
export function buildLiveEvents(n = 25): LiveEvent[] {
  const now = Date.now();
  const span = 60 * 60 * 1000; // 1h
  return Array.from({ length: n }, (_, i) => {
    const typeIdx = i % EVENT_TYPES.length;
    const payload = JSON.stringify({
      correlation_id: `corr-${String(i).padStart(4, '0')}`,
      model: i % 3 === 0 ? 'qwen3-coder-30b' : 'deepseek-r1-14b',
      latency_ms: 50 + (i * 37) % 500,
      tokens: 100 + (i * 73) % 2000,
    });
    return {
      id: `evt-${String(i).padStart(4, '0')}`,
      type: EVENT_TYPES[typeIdx],
      timestamp: new Date(now - span + (i / n) * span).toISOString(),
      source: SOURCES[i % SOURCES.length],
      topic: TOPICS_POOL[i % TOPICS_POOL.length],
      summary: SUMMARIES[i % SUMMARIES.length],
      payload,
    };
  });
}
