import { Text } from '@/components/ui/typography';
import { fmtDate, fmtTokens, fmtUsd, shortId } from './format';
import { HonestyStateBadge } from './HonestyStateBadge';
import type { DelegationRun, DelegationRunStatus } from './delegation-control-plane.types';

const GRID = '1.1fr 1fr 1fr 0.85fr 0.8fr 0.8fr 0.9fr';

function runStatusToHonesty(status: DelegationRunStatus) {
  if (status === 'failed') return 'failure' as const;
  if (status === 'projected') return 'fixture' as const;
  return 'live' as const;
}

export function DelegationRunTable({
  runs,
  selectedRunId,
  maxRuns,
  onSelectRun,
}: {
  runs: DelegationRun[];
  selectedRunId: string | null;
  maxRuns: number;
  onSelectRun: (runId: string) => void;
}) {
  const visible = runs.slice(0, maxRuns);

  return (
    <section style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text as="div" size="sm" weight="semibold" color="primary">
          Recent Runs
        </Text>
        <Text as="div" size="xs" color="tertiary">
          {visible.length} of {runs.length}
        </Text>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, paddingBottom: 5, borderBottom: '1px solid var(--line)' }}>
        {['Correlation', 'Task', 'Model', 'State', 'Tokens', 'Savings', 'Created'].map((heading) => (
          <Text key={heading} as="span" size="xs" color="tertiary">
            {heading}
          </Text>
        ))}
      </div>
      {visible.length === 0 ? (
        <Text as="div" size="sm" color="tertiary" style={{ padding: '10px 0' }}>
          No run rows found in delegation projections.
        </Text>
      ) : (
        visible.map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelectRun(run.id)}
            aria-pressed={selectedRunId === run.id}
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 8,
              alignItems: 'center',
              padding: '7px 0',
              border: 0,
              borderBottom: '1px solid var(--line-2)',
              background: selectedRunId === run.id ? 'var(--panel-2)' : 'transparent',
              color: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <Text as="span" size="xs" family="mono" color="primary" title={run.correlationId}>
              {shortId(run.correlationId)}
            </Text>
            <Text as="span" size="xs" family="mono" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {run.taskType}
            </Text>
            <Text as="span" size="xs" family="mono" color="secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {run.modelName}
            </Text>
            <HonestyStateBadge state={runStatusToHonesty(run.status)} label={run.status} />
            <Text as="span" size="xs" family="mono" color="secondary">
              {fmtTokens(run.tokenCount)}
            </Text>
            <Text as="span" size="xs" family="mono" color="secondary">
              {fmtUsd(run.savingsUsd)}
            </Text>
            <Text as="span" size="xs" family="mono" color="tertiary">
              {fmtDate(run.createdAt)}
            </Text>
          </button>
        ))
      )}
      {runs.length > maxRuns && (
        <Text as="div" size="xs" color="tertiary" style={{ marginTop: 6 }}>
          Showing latest {maxRuns}; increase maxRuns in config for a wider run table.
        </Text>
      )}
    </section>
  );
}
