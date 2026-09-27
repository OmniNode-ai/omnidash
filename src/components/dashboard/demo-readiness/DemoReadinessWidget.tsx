import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import type { ProjectionSnapshot } from '@/data-source';
import { useProjectionSnapshotQuery } from '@/hooks/useProjectionSnapshotQuery';
import { DEMO_NODES, parseDemoReadinessRow, type DemoNodeId, type DemoReadinessRow, type DemoStatus } from '@/data-source/demo-readiness';
import { TOPICS } from '@shared/types/topics';
import { formatAge } from '@/utils/time-format';

const LABELS: Record<DemoNodeId, string> = {
  demo_rehearsal: 'Demo rehearsal',
  demo_drift_detector: 'Demo drift detector',
};

function statusColor(status: DemoStatus): string {
  return status === 'GREEN' ? 'var(--good)' : status === 'BROKEN' ? 'var(--bad)' : 'var(--warn)';
}

export function DemoReadinessView({
  snapshot,
  isLoading = false,
  error = null,
}: {
  snapshot: ProjectionSnapshot<unknown> | null;
  isLoading?: boolean;
  error?: Error | null;
}) {
  if (isLoading || error) {
    return <ComponentWrapper title="Demo Readiness" isLoading={isLoading} error={error}><span /></ComponentWrapper>;
  }

  const byNode = new Map<DemoNodeId, DemoReadinessRow>();
  let invalidCount = 0;
  for (const raw of snapshot?.rows ?? []) {
    const row = parseDemoReadinessRow(raw);
    if (row === null || byNode.has(row.node_id)) invalidCount += 1;
    else byNode.set(row.node_id, row);
  }
  const readAtMs = snapshot ? Date.parse(snapshot.readAt) : Date.now();

  return (
    <ComponentWrapper title="Demo Readiness" isEmpty={false}>
      <div style={{ display: 'grid', gap: 12 }}>
        <Text as="div" size="md" color="secondary">
          Latest terminal event per node. Age is elapsed time since observation; no expected run cadence is declared.
        </Text>
        {snapshot && (
          <Text as="div" size="md" color="secondary">
            Projection activity: {snapshot.dataFreshness}. This does not grade demo health.
          </Text>
        )}
        {snapshot?.rows.length === 0 && (
          <Text as="div" size="md" style={{ color: 'var(--warn)' }} data-testid="demo-readiness-empty">
            EMPTY — no demo terminal events have been observed.
          </Text>
        )}
        {DEMO_NODES.map((nodeId) => {
          const row = byNode.get(nodeId);
          return (
            <div key={nodeId} data-testid="demo-readiness-row" data-node-id={nodeId} data-status={row?.status ?? 'NOT_OBSERVED'} style={{ borderTop: '1px solid var(--line-2)', paddingTop: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <Text as="span" size="lg" weight="semibold">{LABELS[nodeId]}</Text>
                <Text as="span" size="lg" family="mono" style={{ color: row ? statusColor(row.status) : 'var(--warn)' }}>
                  {row?.status ?? 'NOT OBSERVED'}
                </Text>
              </div>
              {row ? (
                <>
                  <Text as="div" size="md" color="secondary">
                    Dashboard URL {row.dashboard_configuration === 'CONFIGURED' ? 'set' : 'missing'} · observed {row.observed_at} · {formatAge(row.observed_at, readAtMs)} old at read
                  </Text>
                  <Text as="div" size="md" color="secondary">Run {row.run_id} · cursor {row.projection_cursor}</Text>
                  {row.dry_run && <Text as="div" size="md" style={{ color: 'var(--warn)' }}>Dry run: no durable evidence artifact.</Text>}
                  {row.status === 'UNCONFIGURED' && (
                    <Text as="div" size="md" style={{ color: 'var(--warn)' }}>Set DEMO_DASHBOARD_URL for this node, then rerun the demo check.</Text>
                  )}
                  {row.status === 'BROKEN' && (
                    <Text as="div" size="md" style={{ color: 'var(--bad)' }}>Review the recorded demo failures before rerunning.</Text>
                  )}
                </>
              ) : (
                <Text as="div" size="md" style={{ color: 'var(--warn)' }}>No terminal event observed for this node.</Text>
              )}
            </div>
          );
        })}
        {invalidCount > 0 && (
          <Text as="div" size="md" style={{ color: 'var(--bad)' }} data-testid="demo-readiness-invalid">
            {invalidCount} malformed or duplicate projection row{invalidCount === 1 ? '' : 's'} refused.
          </Text>
        )}
      </div>
    </ComponentWrapper>
  );
}

export default function DemoReadinessWidget() {
  const query = useProjectionSnapshotQuery<unknown>({
    topic: TOPICS.demoReadiness,
    queryKey: ['demo-readiness'],
    refetchInterval: 15_000,
  });
  return <DemoReadinessView snapshot={query.data ?? null} isLoading={query.isLoading} error={query.error} />;
}
