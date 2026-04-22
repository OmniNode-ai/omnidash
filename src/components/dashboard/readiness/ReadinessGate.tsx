import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useThemeColors } from '@/theme';

type DimensionStatus = 'PASS' | 'WARN' | 'FAIL';

interface ReadinessDimension {
  name: string;
  status: DimensionStatus;
  detail: string;
}

interface ReadinessSummary {
  dimensions: ReadinessDimension[];
  overallStatus: DimensionStatus;
  lastCheckedAt: string;
}

const STATUS_COLORS: Record<DimensionStatus, string> = {
  PASS: 'var(--color-healthy)',
  WARN: 'var(--color-warning)',
  FAIL: 'var(--color-destructive)',
};

function DimensionCard({ dim }: { dim: ReadinessDimension }) {
  const colors = useThemeColors();
  return (
    <div style={{
      border: `1px solid ${STATUS_COLORS[dim.status]}`,
      borderRadius: '0.375rem',
      padding: '0.5rem 0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', color: STATUS_COLORS[dim.status] }}>{dim.status}</div>
      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: colors.foreground }}>{dim.name}</div>
      <div style={{ fontSize: '0.75rem', color: colors.mutedForeground }}>{dim.detail}</div>
    </div>
  );
}

export default function ReadinessGate({ config: _config }: { config: Record<string, unknown> }) {
  const { data: dataArr, isLoading, error } = useProjectionQuery<ReadinessSummary>({
    topic: 'onex.snapshot.projection.overnight.v1',
    queryKey: ['readiness-summary'],
    refetchInterval: 120_000,
  });
  const data = dataArr?.[0];
  const colors = useThemeColors();

  return (
    <ComponentWrapper
      title="Platform Readiness Gate"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!data}
      emptyMessage="No readiness data"
      emptyHint="Readiness dimensions appear after checks are registered"
    >
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: colors.foreground }}>Overall:</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: STATUS_COLORS[data.overallStatus] }}>{data.overallStatus}</span>
            <span style={{ fontSize: '0.6875rem', color: colors.mutedForeground, marginLeft: 'auto' }}>
              Checked {new Date(data.lastCheckedAt).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
            {data.dimensions.map((dim) => <DimensionCard key={dim.name} dim={dim} />)}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
