import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { normalizeStatus } from './swarm-control-plane.types';
import { fmtMs, fmtUsd, fmtDate, fmtRatio } from './format';

const HEADERS = ['Status', 'Run ID', 'Subtasks', 'Speedup', 'Wall time', 'Cost', 'Savings', 'Created'];

function StatusDot({ status }: { status: string }) {
  const color = status === 'succeeded'
    ? 'var(--color-ok, #22c55e)'
    : status === 'failed'
    ? 'var(--color-bad, #ef4444)'
    : status === 'running'
    ? 'var(--color-warn, #f59e0b)'
    : 'var(--text-tertiary, #888)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <Text as="span" size="xs" family="mono" color={status === 'succeeded' ? 'ok' : status === 'failed' ? 'bad' : 'secondary'}>
        {status}
      </Text>
    </div>
  );
}

export function SwarmRunTable({
  runs,
  selectedRunId,
  maxRuns,
  onSelectRun,
}: {
  runs: SwarmRunRow[];
  selectedRunId: string | null;
  maxRuns: number;
  onSelectRun: (runId: string) => void;
}) {
  const visible = runs.slice(0, maxRuns);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  padding: '5px 8px',
                  borderBottom: '1px solid var(--line)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Text as="span" size="xs" color="tertiary">{h}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((run) => {
            const status = normalizeStatus(run.status);
            const isSelected = run.run_id === selectedRunId;
            return (
              <tr
                key={run.run_id}
                onClick={() => onSelectRun(run.run_id)}
                style={{
                  cursor: 'pointer',
                  background: isSelected ? 'var(--panel-2)' : 'transparent',
                  borderBottom: '1px solid var(--line-2)',
                }}
              >
                <td style={{ padding: '6px 8px' }}>
                  <StatusDot status={status} />
                </td>
                <td style={{ padding: '6px 8px', maxWidth: 160 }}>
                  <Text as="span" size="xs" family="mono" color="secondary" title={run.run_id}>
                    {run.run_id.slice(0, 12)}…
                  </Text>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="secondary">
                    {run.subtask_count > 0
                      ? `${run.succeeded_count}/${run.subtask_count}`
                      : '-'}
                  </Text>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Text as="span" size="xs" family="mono" color={run.parallelism_speedup_ratio > 1.5 ? 'ok' : 'secondary'}>
                    {run.parallelism_speedup_ratio > 1 ? fmtRatio(run.parallelism_speedup_ratio) : '-'}
                  </Text>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="secondary">
                    {run.total_latency_ms > 0 ? fmtMs(run.total_latency_ms) : '-'}
                  </Text>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="secondary">
                    {run.total_cost_usd > 0 ? fmtUsd(run.total_cost_usd) : '-'}
                  </Text>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <Text as="span" size="xs" family="mono" color={run.savings_usd > 0 ? 'ok' : 'tertiary'}>
                    {run.savings_usd > 0 ? fmtUsd(run.savings_usd) : '-'}
                  </Text>
                </td>
                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                  <Text as="span" size="xs" family="mono" color="tertiary">
                    {fmtDate(run.created_at)}
                  </Text>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {runs.length === 0 && (
        <Text as="div" size="sm" color="tertiary" style={{ padding: '12px 8px' }}>
          No swarm runs.
        </Text>
      )}
      {runs.length > maxRuns && (
        <Text as="div" size="xs" color="tertiary" style={{ padding: '6px 8px' }}>
          Showing {maxRuns} of {runs.length} runs.
        </Text>
      )}
    </div>
  );
}
