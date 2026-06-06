import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { normalizeStatus } from './swarm-control-plane.types';
import { fmtMs, fmtUsd } from './format';

// ── Derived subtask row ──────────────────────────────────────────────────────

export interface SwarmSubtaskRow {
  subtaskId: string;
  description: string;
  model: string;
  status: 'succeeded' | 'failed' | 'skipped' | 'pending';
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: number | null;
  latencyMs: number | null;
}

/**
 * Derives per-subtask rows from aggregate run data.
 * Actual per-subtask data requires node_swarm_subtask_state_reducer projection.
 * Until then, this derives synthetic rows from aggregate counts + models_used.
 */
export function deriveSubtaskRows(run: SwarmRunRow): SwarmSubtaskRow[] {
  if (run.subtask_count === 0) return [];

  const rows: SwarmSubtaskRow[] = [];
  const runStatus = normalizeStatus(run.status);
  const isComplete = runStatus === 'succeeded' || runStatus === 'failed';

  // Distribute aggregate costs/latency evenly across subtasks as estimates
  const perSubtaskCost = run.total_cost_usd > 0
    ? run.total_cost_usd / run.subtask_count
    : null;
  // Estimate individual latency: dispatch time split evenly, plus aggregation overhead
  const estimatedSubtaskLatency = run.dispatch_wall_latency_ms > 0
    ? Math.round(run.dispatch_wall_latency_ms / Math.max(1, run.subtask_count / (run.parallelism_speedup_ratio || 1)))
    : null;

  for (let i = 0; i < run.subtask_count; i++) {
    let status: SwarmSubtaskRow['status'];
    if (i < run.succeeded_count) {
      status = 'succeeded';
    } else if (i < run.succeeded_count + run.failed_count) {
      status = 'failed';
    } else if (i < run.succeeded_count + run.failed_count + run.skipped_count) {
      status = 'skipped';
    } else {
      status = isComplete ? 'skipped' : 'pending';
    }

    const model = run.models_used.length > 0
      ? run.models_used[i % run.models_used.length]
      : 'unknown';

    rows.push({
      subtaskId: `${run.run_id.slice(0, 8)}-st${String(i + 1).padStart(2, '0')}`,
      description: `Subtask ${String(i + 1).padStart(2, '0')}`,
      model,
      status,
      tokensInput: null,
      tokensOutput: null,
      costUsd: perSubtaskCost,
      latencyMs: status === 'succeeded' || status === 'failed' ? estimatedSubtaskLatency : null,
    });
  }

  return rows;
}

// ── Status badge ─────────────────────────────────────────────────────────────

function SubtaskStatusBadge({ status }: { status: SwarmSubtaskRow['status'] }) {
  const color: 'ok' | 'bad' | 'warn' | 'tertiary' =
    status === 'succeeded' ? 'ok'
    : status === 'failed' ? 'bad'
    : status === 'pending' ? 'warn'
    : 'tertiary';

  const bg =
    status === 'succeeded' ? 'color-mix(in srgb, var(--color-ok, #22c55e) 12%, transparent)'
    : status === 'failed' ? 'color-mix(in srgb, var(--color-bad, #ef4444) 12%, transparent)'
    : status === 'pending' ? 'color-mix(in srgb, var(--color-warn, #f59e0b) 12%, transparent)'
    : 'var(--panel-2)';

  const borderColor =
    status === 'succeeded' ? 'color-mix(in srgb, var(--color-ok, #22c55e) 30%, transparent)'
    : status === 'failed' ? 'color-mix(in srgb, var(--color-bad, #ef4444) 30%, transparent)'
    : status === 'pending' ? 'color-mix(in srgb, var(--color-warn, #f59e0b) 30%, transparent)'
    : 'var(--line-2)';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${borderColor}`,
      }}
    >
      <Text as="span" size="xs" weight="semibold" color={color}>{status}</Text>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SwarmSubtaskDetailPanel({ run }: { run: SwarmRunRow }) {
  const rows = deriveSubtaskRows(run);

  if (run.subtask_count === 0) {
    return (
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 6,
          border: '1px solid var(--line-2)',
          background: 'var(--panel-1)',
        }}
      >
        <Text as="div" size="xs" color="tertiary">
          No subtask data — subtask_count is 0 for this run.
          Requires node_swarm_subtask_state_reducer projection.
        </Text>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Fixture notice */}
      <div
        style={{
          padding: '6px 10px',
          borderRadius: 6,
          background: 'color-mix(in srgb, var(--color-warn, #f59e0b) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-warn, #f59e0b) 25%, transparent)',
        }}
      >
        <Text as="div" size="xs" color="warn">
          Subtask rows derived from aggregate counts — per-subtask tokens and exact latency
          require node_swarm_subtask_state_reducer projection.
        </Text>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Subtask ID', 'Description', 'Model', 'Status', 'Tokens in', 'Tokens out', 'Cost', 'Latency'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '4px 8px',
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
            {rows.map((row) => (
              <tr key={row.subtaskId} style={{ borderBottom: '1px solid var(--line-2)' }}>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="tertiary">{row.subtaskId}</Text>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" color="secondary">{row.description}</Text>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="secondary">{row.model}</Text>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <SubtaskStatusBadge status={row.status} />
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="tertiary">
                    {row.tokensInput != null ? String(row.tokensInput) : '—'}
                  </Text>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="tertiary">
                    {row.tokensOutput != null ? String(row.tokensOutput) : '—'}
                  </Text>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="secondary">
                    {row.costUsd != null ? fmtUsd(row.costUsd) : '—'}
                  </Text>
                </td>
                <td style={{ padding: '5px 8px' }}>
                  <Text as="span" size="xs" family="mono" color="secondary">
                    {row.latencyMs != null ? fmtMs(row.latencyMs) : '—'}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Text as="div" size="xs" color="tertiary">
        {rows.length} subtask{rows.length !== 1 ? 's' : ''} ·{' '}
        {rows.filter((r) => r.status === 'succeeded').length} succeeded ·{' '}
        {rows.filter((r) => r.status === 'failed').length} failed ·{' '}
        {rows.filter((r) => r.status === 'pending').length} pending
      </Text>
    </div>
  );
}
