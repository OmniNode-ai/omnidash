import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { fmtMs, fmtUsd, fmtRatio } from './format';

function CounterCard({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: '10px 14px',
        border: '1px solid var(--line)',
        borderRadius: 8,
        background: 'var(--panel-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="xl" family="mono" color={highlight ? 'ok' : 'primary'}>{value}</Text>
      {sub && <Text as="div" size="xs" color="tertiary">{sub}</Text>}
    </div>
  );
}

export function SwarmLiveCounters({ runs }: { runs: SwarmRunRow[] }) {
  if (runs.length === 0) {
    return (
      <Text as="div" size="sm" color="tertiary">
        No swarm runs. Counters will populate once node_projection_swarm writes to swarm_runs.
      </Text>
    );
  }

  const totalCost = runs.reduce((s, r) => s + r.total_cost_usd, 0);
  const totalSavings = runs.reduce((s, r) => s + r.savings_usd, 0);
  const totalCloudEquiv = runs.reduce((s, r) => s + r.cloud_equivalent_cost_usd, 0);
  const totalWallMs = runs.reduce((s, r) => s + r.total_latency_ms, 0);
  const avgSpeedup = runs.length > 0
    ? runs.reduce((s, r) => s + r.parallelism_speedup_ratio, 0) / runs.length
    : 1;

  const succeededRuns = runs.filter((r) => r.status === 'succeeded').length;
  const totalSubtasks = runs.reduce((s, r) => s + r.subtask_count, 0);
  const succeededSubtasks = runs.reduce((s, r) => s + r.succeeded_count, 0);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
      }}
    >
      <CounterCard
        label="Total runs"
        value={String(runs.length)}
        sub={`${succeededRuns} succeeded`}
      />
      <CounterCard
        label="Total subtasks"
        value={String(totalSubtasks)}
        sub={totalSubtasks > 0 ? `${succeededSubtasks} succeeded` : 'pending projection'}
      />
      <CounterCard
        label="Avg speedup ratio"
        value={fmtRatio(avgSpeedup)}
        sub="parallelism gain"
        highlight={avgSpeedup > 1.5}
      />
      <CounterCard
        label="Total wall time"
        value={totalWallMs > 0 ? fmtMs(totalWallMs) : '-'}
        sub="across all runs"
      />
      <CounterCard
        label="Total cost"
        value={fmtUsd(totalCost)}
        sub="local inference"
      />
      <CounterCard
        label="Cumulative savings"
        value={fmtUsd(totalSavings)}
        sub={totalCloudEquiv > 0 ? `vs ${fmtUsd(totalCloudEquiv)} cloud` : 'vs baseline'}
        highlight={totalSavings > 0}
      />
    </div>
  );
}
