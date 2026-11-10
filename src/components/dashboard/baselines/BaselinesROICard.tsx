import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { Text } from '@/components/ui/typography';
import { TOPICS } from '@shared/types/topics';
import { localeString as fmtLocaleString } from '@/lib/format';
import { refreshInterval } from '@/lib/refresh';
// OMN-23330 AC25: this file's fixed inline styles are classes in BaselinesROICard.static.css.
import './BaselinesROICard.static.css';

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
  const formatted = fmtLocaleString(value);
  return (
    <div className="baselines-roicard-s51a6fe">
      <Text as="div" size="3xl" weight="bold" color={improved ? 'ok' : 'warn'}>
        {value > 0 ? '+' : ''}{formatted}{unit ?? ''}
      </Text>
      <Text as="div" size="md" color="secondary">{label}</Text>
    </div>
  );
}

// STAY-BESPOKE (OMN-10296): mixes a 3-column KPI cluster with a recommendation list section.
// This dual-layout does not decompose cleanly to <KPITileCluster> alone.
// Re-evaluate migration post-iteration-1 when KPITileCluster has wider adoption.
export default function BaselinesROICard({ config: _config }: { config: Record<string, unknown> }) {
  const { data: dataArr, isLoading, error } = useProjectionQuery<BaselinesSummary>({
    topic: TOPICS.baselinesRoi,
    queryKey: ['baselines-summary'],
    refetchInterval: refreshInterval(),
  });
  const data = dataArr?.[0] ?? null;

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
        <div className="baselines-roicard-s25d6a4">
          <div className="baselines-roicard-s64891b">
            <DeltaMetric label="Token Delta" value={data.tokenDelta} />
            <DeltaMetric label="Time Delta" value={data.timeDeltaMs} unit="ms" />
            <DeltaMetric label="Retry Delta" value={data.retryDelta} />
          </div>
          <div className="baselines-roicard-s2c9932">
            <div className="baselines-roicard-s1c09f0">
              <Text as="div" size="md" color="secondary">Recommendations</Text>
            </div>
            <div className="baselines-roicard-s366990">
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
