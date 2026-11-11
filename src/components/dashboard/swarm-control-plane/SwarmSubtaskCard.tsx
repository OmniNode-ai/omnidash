import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { normalizeStatus } from './swarm-control-plane.types';
import { fmtMs, fmtUsd } from './format';
import { fixed as fmtFixed } from '@/theme/format';
// OMN-23330 AC25: this file's fixed inline styles are classes in SwarmSubtaskCard.static.css.
import './SwarmSubtaskCard.static.css';

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
          ? 'color-mix(in srgb, var(--ds-ok, var(--ds-ok)) 12%, transparent)'
          : status === 'failed'
          ? 'color-mix(in srgb, var(--ds-bad, var(--ds-bad)) 12%, transparent)'
          : 'var(--ds-surface-2)',
        border: '1px solid',
        borderColor: status === 'succeeded'
          ? 'color-mix(in srgb, var(--ds-ok, var(--ds-ok)) 30%, transparent)'
          : status === 'failed'
          ? 'color-mix(in srgb, var(--ds-bad, var(--ds-bad)) 30%, transparent)'
          : 'var(--ds-line-soft)',
      }}
    >
      <Text as="span" size="xs" weight="semibold" color={color}>{status}</Text>
    </div>
  );
}

function MetricPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="swarm-subtask-card-sb6d841">
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
    <div className="swarm-subtask-card-sb78a29"
    >
      <div className="swarm-subtask-card-sd74d06">
        <div className="swarm-subtask-card-s2cd52a">
          <Text className="swarm-subtask-card-s0eca93" as="div" size="xs" family="mono" color="tertiary">
            {run.run_id}
          </Text>
          <Text className="swarm-subtask-card-saeb83f" as="div" size="xs" color="tertiary">
            correlation: {run.correlation_id.slice(0, 16)}…
          </Text>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="swarm-subtask-card-s0896aa">
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
          value={run.parallelism_speedup_ratio > 1 ? `${fmtFixed(run.parallelism_speedup_ratio, 2)}×` : '-'}
        />
      </div>

      {hasModels && (
        <div>
          <Text className="swarm-subtask-card-s3eaa7b" as="div" size="xs" color="tertiary">Models used</Text>
          <div className="swarm-subtask-card-s5404ea">
            {run.models_used.map((m) => (
              <Text className="swarm-subtask-card-s38fb0f" key={m} as="span" size="xs" family="mono" color="secondary"
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
