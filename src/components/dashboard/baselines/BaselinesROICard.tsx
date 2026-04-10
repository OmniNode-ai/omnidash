import { ComponentWrapper } from '../ComponentWrapper';
import { useComponentData } from '@/hooks/useComponentData';
import { useThemeColors } from '@/theme';

interface BaselinesSummary {
  snapshotId: string;
  capturedAt: string;
  tokenDelta: number;
  timeDeltaMs: number;
  retryDelta: number;
  recommendations: { promote: number; shadow: number; suppress: number; fork: number };
  confidence: number;
}

function DeltaMetric({ label, value, unit }: { label: string; value: number; unit?: string }) {
  const colors = useThemeColors();
  const improved = value <= 0;
  const formatted = value.toLocaleString();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: improved ? colors.status.healthy : colors.status.warning }}>
        {value > 0 ? '+' : ''}{formatted}{unit ?? ''}
      </div>
      <div style={{ fontSize: '0.6875rem', color: colors.muted }}>{label}</div>
    </div>
  );
}

export default function BaselinesROICard({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useComponentData<BaselinesSummary | null>(
    '/api/baselines/summary',
    { queryKey: ['baselines-summary'], refetchInterval: 120_000 }
  );

  const colors = useThemeColors();

  return (
    <ComponentWrapper
      title="Baselines ROI"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!data}
      emptyMessage="No baseline snapshot"
      emptyHint="Baselines appear after snapshot comparisons are recorded"
    >
      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <DeltaMetric label="Token Delta" value={data.tokenDelta} />
            <DeltaMetric label="Time Delta" value={data.timeDeltaMs} unit="ms" />
            <DeltaMetric label="Retry Delta" value={data.retryDelta} />
          </div>
          <div style={{ borderTop: `1px solid hsl(${colors.border})`, paddingTop: '0.75rem' }}>
            <div style={{ fontSize: '0.6875rem', color: colors.muted, marginBottom: '0.5rem' }}>Recommendations</div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {Object.entries(data.recommendations).map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: '1rem', fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: '0.6875rem', color: colors.muted, textTransform: 'capitalize' }}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
