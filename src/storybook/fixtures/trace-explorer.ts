import type { TraceGroup } from '@/components/dashboard/trace-explorer/TraceExplorerWidget';

const NODES = [
  'node_build_loop',
  'node_test_runner',
  'node_log_persistence_effect',
  'node_projection_traces',
  'node_dispatch_worker',
];

const MESSAGES = [
  'Phase started',
  'Running tests',
  'Tests passed',
  'Phase complete',
  'Writing log entry',
  'Projection updated',
  'Worker dispatched',
  'Error: connection timeout',
  'Retrying after backoff',
  'Task completed successfully',
];

export interface BuildTraceGroupsOptions {
  count?: number;
  includeRunning?: boolean;
  includeErrors?: boolean;
}

export function buildTraceGroups(opts: BuildTraceGroupsOptions = {}): TraceGroup[] {
  const { count = 5, includeRunning = true, includeErrors = true } = opts;
  const now = Date.now();

  return Array.from({ length: count }, (_, i) => {
    const isRunning = includeRunning && i === 0;
    const hasError = includeErrors && i === count - 1;
    const durationMs = 800 + (i * 317) % 12000;
    const nodeCount = 1 + (i % NODES.length);
    const nodes = NODES.slice(0, nodeCount);

    return {
      correlation_id: `corr-${String(i + 1).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`,
      nodes_involved: nodes,
      event_count: 3 + (i * 7) % 30,
      first_event_at: new Date(now - durationMs - (i * 60_000)).toISOString(),
      last_event_at: isRunning
        ? new Date(now - 500).toISOString()
        : new Date(now - (i * 60_000)).toISOString(),
      duration_ms: isRunning ? Date.now() - (now - durationMs - (i * 60_000)) : durationMs,
      has_error: hasError,
      is_running: isRunning,
      latest_message: MESSAGES[(i * 3) % MESSAGES.length],
    };
  });
}
