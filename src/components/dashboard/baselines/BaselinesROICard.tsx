import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useThemeColors } from '@/theme';
import { Text } from '@/components/ui/typography';

export interface BaselinesSummary {
  snapshotId: string;
  capturedAt: string;
  tokenDelta: number;
  timeDeltaMs: number;
  retryDelta: number;
  recommendations: { promote: number; shadow: number; suppress: number; fork: number };
  confidence: number;
}

function DeltaMetric({ label, value, unit }: { label: string; value: number; unit?: string }) {
  const improved = value <= 0;
  const formatted = value.toLocaleString();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
      <Text as="div" size="3xl" weight="bold" color={improved ? 'ok' : 'warn'}>
        {value > 0 ? '+' : ''}{formatted}{unit ?? ''}
      </Text>
      <Text as="div" size="md" color="secondary">{label}</Text>
    </div>
  );
}

export default function BaselinesROICard({ config: _config }: { config: Record<string, unknown> }) {
  const { data: dataArr, isLoading, error } = useProjectionQuery<BaselinesSummary>({
    topic: 'onex.snapshot.projection.baselines.roi.v1',
    queryKey: ['baselines-summary'],
    refetchInterval: 120_000,
  });
  const data = dataArr?.[0] ?? null;

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
            <div style={{ marginBottom: '0.5rem' }}>
              <Text as="div" size="md" color="secondary">Recommendations</Text>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {Object.entries(data.recommendations).map(([k, v]) => (
                <div key={k}>
                  <Text as="div" size="2xl" weight="bold">{v}</Text>
                  <Text as="div" size="md" color="secondary" transform="capitalize">{k}</Text>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
