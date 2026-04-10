import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useComponentData } from '@/hooks/useComponentData';
import { useThemeColors } from '@/theme';

interface QualitySummary {
  meanScore: number;
  distribution: Array<{ bucket: string; count: number }>;
  totalMeasurements: number;
}

export default function QualityScorePanel({ config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useComponentData<QualitySummary>(
    '/api/intelligence/quality/summary',
    { queryKey: ['quality-summary'], refetchInterval: 60_000 }
  );
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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ fontSize: '0.75rem', color: colors.muted, marginBottom: '0.5rem' }}>
            Mean Score: <strong>{data.meanScore.toFixed(2)}</strong> · {data.totalMeasurements.toLocaleString()} measurements
          </div>
          {chartOption && <ReactECharts option={chartOption} style={{ flex: 1, minHeight: '150px' }} notMerge />}
        </div>
      )}
    </ComponentWrapper>
  );
}
