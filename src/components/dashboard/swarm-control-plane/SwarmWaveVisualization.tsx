import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { normalizeStatus } from './swarm-control-plane.types';
import { fmtMs } from './format';

function StatusDot({ status }: { status: string }) {
  const color = status === 'succeeded'
    ? 'var(--color-ok, #22c55e)'
    : status === 'failed'
    ? 'var(--color-bad, #ef4444)'
    : status === 'running'
    ? 'var(--color-warn, #f59e0b)'
    : 'var(--text-tertiary, #888)';
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

function SubtaskSlot({ index, label, status }: { index: number; label: string; status: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        border: '1px solid var(--line-2)',
        borderRadius: 6,
        background: 'var(--panel-2)',
      }}
    >
      <StatusDot status={status} />
      <Text as="span" size="xs" family="mono" color="secondary">{label}</Text>
      <Text as="span" size="xs" color="tertiary">#{index + 1}</Text>
    </div>
  );
}

function WaveBlock({
  waveIndex,
  subtaskCount,
  status,
  latencyMs,
  isWaiting,
}: {
  waveIndex: number;
  subtaskCount: number;
  status: string;
  latencyMs: number;
  isWaiting: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${isWaiting ? 'var(--line-2)' : 'var(--line)'}`,
        borderRadius: 8,
        padding: 10,
        background: isWaiting ? 'var(--panel-1)' : 'var(--panel-2)',
        opacity: isWaiting ? 0.65 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text as="span" size="xs" weight="semibold" color={isWaiting ? 'tertiary' : 'primary'}>
          Wave {waveIndex}
        </Text>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isWaiting && (
            <Text as="span" size="xs" color="tertiary">waiting</Text>
          )}
          {latencyMs > 0 && !isWaiting && (
            <Text as="span" size="xs" family="mono" color="secondary">{fmtMs(latencyMs)}</Text>
          )}
          <Text as="span" size="xs" color="tertiary">{subtaskCount} subtask{subtaskCount !== 1 ? 's' : ''}</Text>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: subtaskCount }, (_, i) => (
          <SubtaskSlot
            key={i}
            index={i}
            label={isWaiting ? 'pending' : status}
            status={isWaiting ? 'pending' : status}
          />
        ))}
      </div>
    </div>
  );
}

export function SwarmWaveVisualization({ run }: { run: SwarmRunRow }) {
  const status = normalizeStatus(run.status);

  if (run.subtask_count === 0) {
    return (
      <div
        style={{
          padding: 12,
          border: '1px dashed var(--line-2)',
          borderRadius: 8,
          background: 'var(--panel-1)',
        }}
      >
        <Text as="div" size="sm" color="tertiary">
          Wave layout pending — subtask_count is 0.
        </Text>
        <Text as="div" size="xs" color="tertiary" style={{ marginTop: 4 }}>
          Wave decomposition requires node_swarm_subtask_state_reducer to project per-subtask rows.
          The swarm_runs aggregate row is written by node_projection_swarm on terminal events.
        </Text>
      </div>
    );
  }

  // With only aggregate counts, heuristically split into Wave 0 (parallel) and Wave 1 (remainder).
  // When the subtask state reducer is deployed, this will be replaced by actual wave assignments.
  const wave0Count = Math.ceil(run.subtask_count * 0.6);
  const wave1Count = run.subtask_count - wave0Count;
  const isRunComplete = status === 'succeeded' || status === 'failed';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Text as="div" size="xs" color="tertiary">
        Wave layout derived from subtask_count aggregate. Per-subtask wave assignments require
        node_swarm_subtask_state_reducer projection.
      </Text>
      <WaveBlock
        waveIndex={0}
        subtaskCount={wave0Count}
        status={isRunComplete ? status : 'running'}
        latencyMs={run.dispatch_wall_latency_ms}
        isWaiting={false}
      />
      {wave1Count > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Text as="span" size="xs" color="tertiary">→ depends on Wave 0</Text>
          </div>
          <WaveBlock
            waveIndex={1}
            subtaskCount={wave1Count}
            status={isRunComplete ? status : 'pending'}
            latencyMs={run.aggregation_latency_ms}
            isWaiting={!isRunComplete}
          />
        </>
      )}
    </div>
  );
}
