import type { PipelineEvent } from '@/components/dashboard/control-plane/PipelineLogStream';

export interface BuildPipelineEventsOptions {
  /** Number of pipeline runs to generate. Default 1. */
  runs?: number;
  /** Fixed anchor timestamp for deterministic stories. Defaults to now. */
  anchorAt?: string;
}

const GOLDEN_PROMPT = 'Classify customer review sentiment as positive, neutral, or negative with a confidence score';

export function buildPipelineEvents(
  opts: BuildPipelineEventsOptions = {},
): PipelineEvent[] {
  const runs = opts.runs ?? 1;
  const anchor = opts.anchorAt ? new Date(opts.anchorAt).getTime() : Date.now();
  const events: PipelineEvent[] = [];

  for (let r = 0; r < runs; r++) {
    const correlationId = `demo-golden-${String(r + 1).padStart(3, '0')}`;
    const base = anchor - (runs - r - 1) * 90_000;

    events.push(
      {
        id: `${correlationId}-req`,
        type: 'request',
        timestamp: new Date(base).toISOString(),
        source: 'control-plane',
        message: `Node generation requested: ${GOLDEN_PROMPT}`,
        correlationId,
      },
      {
        id: `${correlationId}-val`,
        type: 'validation',
        timestamp: new Date(base + 2_000).toISOString(),
        source: 'validator',
        message: 'Contract schema validated: 0 errors, 0 warnings',
        correlationId,
      },
      {
        id: `${correlationId}-dep`,
        type: 'success',
        timestamp: new Date(base + 5_000).toISOString(),
        source: 'deployer',
        message: 'Contract deployed to .201 stability lane via Kafka',
        correlationId,
      },
      {
        id: `${correlationId}-mat`,
        type: 'success',
        timestamp: new Date(base + 6_000).toISOString(),
        source: 'runtime',
        message: 'Contract materialized: node_sentiment_classifier (no restart)',
        correlationId,
      },
      {
        id: `${correlationId}-mcp`,
        type: 'success',
        timestamp: new Date(base + 7_000).toISOString(),
        source: 'mcp-server',
        message: 'MCP tool registered: node_sentiment_classifier on :8090',
        correlationId,
      },
    );
  }

  return events;
}
