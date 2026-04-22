import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useThemeColors } from '@/theme';

interface QualitySummary {
  meanScore: number;
  distribution: Array<{ bucket: string; count: number }>;
  totalMeasurements: number;
}

export default function QualityScorePanel({ config: _config }: { config: Record<string, unknown> }) {
  const { data: dataArr, isLoading, error } = useProjectionQuery<QualitySummary>({
    topic: 'onex.snapshot.projection.baselines.quality.v1',
    queryKey: ['quality-summary'],
    refetchInterval: 60_000,
  });
  const data = dataArr?.[0];
  const colors = useThemeColors();

  const chartOption = useMemo(() => {
    if (!data || data.distribution.length === 0) return null;
    return {
      tooltip: { trigger: 'axis' as const },
      xAxis: { type: 'category' as const, data: data.distribution.map((b) => b.bucket), axisLabel: { color: colors.muted } },
      yAxis: { type: 'value' as const, name: 'Count', axisLabel: { color: colors.muted } },
      series: [{
        type: 'bar' as const,
        data: data.distribution.map((b, i) => ({
          value: b.count,
          itemStyle: { color: colors.chart[i % colors.chart.length] },
        })),
        markLine: {
          data: [{ type: 'average' as const, name: 'Mean', label: { formatter: `Mean: ${data.meanScore.toFixed(2)}` } }],
        },
      }],
      backgroundColor: 'transparent',
    };
  }, [data, colors]);

  const isEmpty = !data || data.totalMeasurements === 0;

  return (
    <ComponentWrapper
      title="Quality Score Distribution"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No quality data"
      emptyHint="Quality scores appear after pattern evaluations are recorded"
    >
      {data && !isEmpty && (
        <div>
          <div style={{ fontSize: '0.75rem', color: colors.muted, marginBottom: '0.5rem' }}>
            Mean Score: <strong>{data.meanScore.toFixed(2)}</strong> · {data.totalMeasurements.toLocaleString()} measurements
          </div>
          {/* Fixed 320px to match CostTrendPanel. The prior flex:1 + minHeight:150px
              inside an unconstrained height:100% flex column resolved to ~7px. */}
          {chartOption && <ReactECharts option={chartOption} style={{ height: '320px' }} notMerge />}
        </div>
      )}
    </ComponentWrapper>
  );
}
