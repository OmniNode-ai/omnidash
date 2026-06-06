import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { normalizeStatus } from './swarm-control-plane.types';
import { fmtMs, fmtUsd } from './format';

function StatusBadge({ status }: { status: string }) {
  const color = status === 'succeeded' ? 'ok'
    : status === 'failed' ? 'bad'
    : status === 'running' ? 'warn'
    : 'tertiary';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 4,
        background: status === 'succeeded'
          ? 'color-mix(in srgb, var(--color-ok, #22c55e) 12%, transparent)'
          : status === 'failed'
          ? 'color-mix(in srgb, var(--color-bad, #ef4444) 12%, transparent)'
          : 'var(--panel-2)',
        border: '1px solid',
        borderColor: status === 'succeeded'
          ? 'color-mix(in srgb, var(--color-ok, #22c55e) 30%, transparent)'
          : status === 'failed'
          ? 'color-mix(in srgb, var(--color-bad, #ef4444) 30%, transparent)'
          : 'var(--line-2)',
      }}
    >
      <Text as="span" size="xs" weight="semibold" color={color}>{status}</Text>
    </div>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Text as="span" size="xs" color="tertiary">{label}</Text>
      <Text as="span" size="xs" family="mono" color="secondary">{value}</Text>
    </div>
  );
}

export function SwarmSubtaskCard({ run }: { run: SwarmRunRow }) {
  const status = normalizeStatus(run.status);
  const hasSubtasks = run.subtask_count > 0;
  const hasModels = run.models_used.length > 0;

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        background: 'var(--panel-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <Text as="div" size="xs" family="mono" color="tertiary" style={{ overflowWrap: 'break-word' }}>
            {run.run_id}
          </Text>
          <Text as="div" size="xs" color="tertiary" style={{ marginTop: 2 }}>
            correlation: {run.correlation_id.slice(0, 16)}…
          </Text>
        </div>
        <StatusBadge status={status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <MetricPair label="subtasks" value={hasSubtasks ? String(run.subtask_count) : '-'} />
        <MetricPair label="succeeded" value={hasSubtasks ? String(run.succeeded_count) : '-'} />
        <MetricPair label="failed" value={hasSubtasks ? String(run.failed_count) : '-'} />
        <MetricPair label="wall time" value={run.total_latency_ms > 0 ? fmtMs(run.total_latency_ms) : '-'} />
        <MetricPair label="decomp" value={run.decomposition_latency_ms > 0 ? fmtMs(run.decomposition_latency_ms) : '-'} />
        <MetricPair label="dispatch" value={run.dispatch_wall_latency_ms > 0 ? fmtMs(run.dispatch_wall_latency_ms) : '-'} />
        <MetricPair label="cost" value={run.total_cost_usd > 0 ? fmtUsd(run.total_cost_usd) : '-'} />
        <MetricPair label="savings" value={run.savings_usd > 0 ? fmtUsd(run.savings_usd) : '-'} />
        <MetricPair
          label="speedup"
          value={run.parallelism_speedup_ratio > 1 ? `${run.parallelism_speedup_ratio.toFixed(2)}×` : '-'}
        />
      </div>

      {hasModels && (
        <div>
          <Text as="div" size="xs" color="tertiary" style={{ marginBottom: 4 }}>Models used</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {run.models_used.map((m) => (
              <Text key={m} as="span" size="xs" family="mono" color="secondary"
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--line-2)',
                  borderRadius: 4,
                  background: 'var(--panel-2)',
                }}
              >
                {m}
              </Text>
            ))}
          </div>
        </div>
      )}

      {run.endpoint_registry_hash && (
        <Text as="div" size="xs" family="mono" color="tertiary">
          registry: {run.endpoint_registry_hash.slice(0, 12)}… v{run.registry_schema_version || '-'}
        </Text>
      )}
    </div>
  );
}
