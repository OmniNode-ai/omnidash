import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { useThemeColors } from '@/theme';

interface CostDataPoint {
  bucket_time: string;
  model_name: string;
  total_cost_usd: string;
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  request_count?: number;
}

interface CostTrendConfig {
  granularity?: 'hour' | 'day';
  showBudgetLine?: boolean;
}

export default function CostTrendPanel({ config }: { config: CostTrendConfig }) {
  const granularity = config.granularity || 'day';
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint[]>(
    `/api/intelligence/cost/trends?granularity=${granularity}`,
    { queryKey: ['cost-trends', granularity], refetchInterval: 60_000 }
  );

  const colors = useThemeColors();

  const chartOption = useMemo(() => {
    if (!data || data.length === 0) return null;

    const models = [...new Set(data.map((d) => d.model_name))];
    const dates = [...new Set(data.map((d) => d.bucket_time))].sort();

    return {
      tooltip: { trigger: 'axis' as const },
      legend: { data: models, textStyle: { color: colors.foreground } },
      xAxis: {
        type: 'category' as const,
        data: dates.map((d) => d.split('T')[0]),
        axisLabel: { color: colors.muted },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Cost (USD)',
        axisLabel: { color: colors.muted, formatter: '${value}' },
      },
      series: models.map((model, i) => ({
        name: model,
        type: 'line' as const,
        smooth: true,
        data: dates.map((date) => {
          const point = data.find((d) => d.bucket_time === date && d.model_name === model);
          return point ? parseFloat(point.total_cost_usd) : 0;
        }),
        itemStyle: { color: colors.chart[i % colors.chart.length] },
      })),
      backgroundColor: 'transparent',
    };
  }, [data, colors]);

  return (
    <ComponentWrapper
      title="Cost Trend"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!data || data.length === 0}
      emptyMessage="No cost data available"
      emptyHint="Cost data appears after LLM calls are tracked"
    >
      {chartOption && (
        <ReactECharts option={chartOption} style={{ height: '100%', minHeight: '200px' }} notMerge />
      )}
    </ComponentWrapper>
  );
}
