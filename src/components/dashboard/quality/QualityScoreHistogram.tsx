// T18 (OMN-159): 2D companion to QualityScorePanel. Vertical histogram
// with 5 bars colored on a red→green gradient, a threshold line, and a
// mean marker. Same data shape as QualityScorePanel — pulls from the
// same projection topic.
//
// Lower priority than the CostByModel 2D companion because the 3D
// quality bars don't suffer the same chart-literacy issue (ordered
// buckets, mild occlusion, threshold plane is informative). Still nice
// to have as a flat alternative.
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { useThemeColors } from '@/theme';

interface QualityDistributionBucket {
  bucket: string;
  count: number;
}

interface QualitySummary {
  meanScore: number;
  distribution: QualityDistributionBucket[];
  totalMeasurements: number;
}

interface Config {
  /** Score at/above which a measurement is counted as passing. Default 0.8. */
  passThreshold?: number;
}

// Bar score-domain midpoints, mirroring QualityScorePanel.
const BUCKET_MIDPOINTS = [0.1, 0.3, 0.5, 0.7, 0.9];

function tierColor(t: number): string {
  // t ∈ [0, 1] → hue 0 (red) … 120 (green)
  const hue = t * 120;
  return `hsl(${hue} 70% 50%)`;
}

export default function QualityScoreHistogram({ config }: { config: Config }) {
  const passThreshold = typeof config.passThreshold === 'number' ? config.passThreshold : 0.8;

  const { data: dataArr, isLoading, error } = useProjectionQuery<QualitySummary>({
    topic: TOPICS.baselinesQuality,
    queryKey: ['quality-summary'],
  });
  const data = dataArr?.[0];

  const isEmpty = !data || !data.totalMeasurements;

  const bars = useMemo(() => {
    if (!data) return [];
    const dist = data.distribution.slice(0, 5);
    while (dist.length < 5) dist.push({ bucket: `${dist.length}`, count: 0 });
    const max = Math.max(1, ...dist.map((b) => b.count));
    return dist.map((b, i) => ({
      ...b,
      score: BUCKET_MIDPOINTS[i],
      heightPct: (b.count / max) * 100,
      color: tierColor(i / (5 - 1)),
    }));
  }, [data]);

  // Threshold and mean as percentages along the x axis (0..1 → 0..100%).
  const thresholdLeft = `${Math.max(0, Math.min(100, passThreshold * 100))}%`;
  const meanLeft = data ? `${Math.max(0, Math.min(100, data.meanScore * 100))}%` : '0%';
  const passRate = data
    ? bars
        .filter((b) => (b.score ?? 0) >= passThreshold)
        .reduce((acc, b) => acc + b.count, 0) /
      Math.max(1, data.totalMeasurements)
    : 0;

  const colors = useThemeColors();

  return (
    <ComponentWrapper
      title="Quality Scores"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No quality scores"
      emptyHint="Quality scores appear after patterns are evaluated"
    >
      {data && !isEmpty && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem', padding: '0.5rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
            <Text size="3xl" weight="bold" color={passRate >= passThreshold ? 'ok' : 'warn'}>
              {Math.round(passRate * 100)}%
            </Text>
            <Text size="sm" color="secondary">pass rate · n={data.totalMeasurements}</Text>
          </div>
          <div style={{ position: 'relative', flex: 1, minHeight: 80 }}>
            {/* Threshold line */}
            <div
              aria-hidden="true"
              data-testid="threshold-line"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 16,
                left: thresholdLeft,
                width: 0,
                borderLeft: `2px dashed ${colors.foreground}`,
                opacity: 0.5,
              }}
            />
            {/* Mean marker */}
            <div
              aria-hidden="true"
              data-testid="mean-marker"
              style={{
                position: 'absolute',
                bottom: 16,
                left: meanLeft,
                transform: 'translate(-50%, 0)',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: colors.accent,
              }}
            />
            {/* Bars — top region, leaves 16px at the bottom for the label
                row (mirrors the `bottom: 16` reserved by the threshold line
                and mean marker above). Bars grow upward from the baseline. */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 16, display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
              {bars.map((b, i) => (
                <div
                  key={i}
                  role="meter"
                  aria-label={`bucket ${b.bucket} count ${b.count}`}
                  aria-valuenow={b.count}
                  aria-valuemin={0}
                  style={{
                    flex: 1,
                    height: `${b.heightPct}%`,
                    minHeight: 2,
                    background: b.color,
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              ))}
            </div>
            {/* Bucket labels — fixed-height row pinned to the bottom of the
                chart area. Pulling labels out of the per-bar columns is what
                lets bars use 100% of their available height without the
                stale `calc(... - 24px)` hack that previously clipped every
                small bar to `minHeight: 2`. */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, display: 'flex', gap: '0.5rem' }}>
              {bars.map((b, i) => (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <Text family="mono" size="xs" color="secondary">{b.bucket}</Text>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
