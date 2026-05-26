import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { normalizeStatus } from './swarm-control-plane.types';
import { fmtMs, fmtUsd } from './format';

function RootNode({ run }: { run: SwarmRunRow }) {
  const status = normalizeStatus(run.status);
  const dotColor = status === 'succeeded'
    ? 'var(--color-ok, #22c55e)'
    : status === 'failed'
    ? 'var(--color-bad, #ef4444)'
    : 'var(--color-warn, #f59e0b)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '8px 12px',
        border: '1px solid var(--line)',
        borderRadius: 8,
        background: 'var(--panel-2)',
      }}
    >
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />
      <div>
        <Text as="div" size="sm" weight="semibold" color="primary">Swarm run</Text>
        <Text as="div" size="xs" family="mono" color="tertiary" style={{ marginTop: 2 }}>
          {run.run_id}
        </Text>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          <Text as="span" size="xs" color="secondary">{run.subtask_count} subtasks</Text>
          {run.total_latency_ms > 0 && (
            <Text as="span" size="xs" family="mono" color="secondary">{fmtMs(run.total_latency_ms)}</Text>
          )}
          {run.savings_usd > 0 && (
            <Text as="span" size="xs" family="mono" color="ok">saved {fmtUsd(run.savings_usd)}</Text>
          )}
        </div>
      </div>
    </div>
  );
}

function SubtaskNode({
  index,
  status,
  modelHint,
  isLast,
}: {
  index: number;
  status: string;
  modelHint: string;
  isLast: boolean;
}) {
  const dotColor = status === 'succeeded'
    ? 'var(--color-ok, #22c55e)'
    : status === 'failed'
    ? 'var(--color-bad, #ef4444)'
    : 'var(--text-tertiary, #888)';

  return (
    <div style={{ display: 'flex', gap: 0 }}>
      {/* Tree connector */}
      <div style={{ width: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 1, flex: 1, background: 'var(--line-2)', minHeight: isLast ? '50%' : '100%' }} />
        <div style={{ width: 12, height: 1, background: 'var(--line-2)', flexShrink: 0 }} />
        {!isLast && <div style={{ width: 1, flex: 1, background: 'var(--line-2)' }} />}
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          border: '1px solid var(--line-2)',
          borderRadius: 6,
          background: 'var(--panel-1)',
          marginBottom: isLast ? 0 : 4,
          marginTop: 4,
        }}
      >
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <Text as="span" size="xs" family="mono" color="secondary">subtask-{String(index + 1).padStart(2, '0')}</Text>
        <Text as="span" size="xs" color="tertiary">{status}</Text>
        {modelHint && (
          <Text as="span" size="xs" family="mono" color="tertiary">{modelHint}</Text>
        )}
      </div>
    </div>
  );
}

export function SwarmDecompositionTree({ run }: { run: SwarmRunRow }) {
  const status = normalizeStatus(run.status);
  const isComplete = status === 'succeeded' || status === 'failed';

  if (run.subtask_count === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <RootNode run={run} />
        <Text as="div" size="xs" color="tertiary" style={{ paddingLeft: 12 }}>
          Decomposition tree pending — subtask_count is 0.
          Requires node_swarm_subtask_state_reducer projection.
        </Text>
      </div>
    );
  }

  const modelHints: string[] = [];
  if (run.models_used.length > 0) {
    for (let i = 0; i < run.subtask_count; i++) {
      modelHints.push(run.models_used[i % run.models_used.length]);
    }
  }

  // Derive per-subtask statuses from aggregate counts
  const perSubtaskStatus: string[] = [];
  for (let i = 0; i < run.subtask_count; i++) {
    if (i < run.succeeded_count) {
      perSubtaskStatus.push('succeeded');
    } else if (i < run.succeeded_count + run.failed_count) {
      perSubtaskStatus.push('failed');
    } else {
      perSubtaskStatus.push(isComplete ? 'skipped' : 'pending');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <RootNode run={run} />
      <div style={{ marginLeft: 12, marginTop: 4 }}>
        {perSubtaskStatus.map((st, i) => (
          <SubtaskNode
            key={i}
            index={i}
            status={st}
            modelHint={modelHints[i] ?? ''}
            isLast={i === perSubtaskStatus.length - 1}
          />
        ))}
      </div>
      {run.subtask_count > 0 && (
        <Text as="div" size="xs" color="tertiary" style={{ marginTop: 6, paddingLeft: 12 }}>
          Subtask order, wave assignments, and dependency arrows require
          node_swarm_subtask_state_reducer projection.
        </Text>
      )}
    </div>
  );
}
