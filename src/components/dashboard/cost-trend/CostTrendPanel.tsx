import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useThemeColors } from '@/theme';
import { useFrameStore } from '@/store/store';

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
  const granularity = config.granularity || 'hour';
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint>({
    topic: 'onex.snapshot.projection.llm_cost.v1',
    queryKey: ['cost-trends', granularity],
    refetchInterval: 60_000,
  });

  // Dashboard-level time range. Widget declares supports_time_range: true
  // in its manifest and participates here; queryKey intentionally ignores
  // the range so the cache stays keyed on topic — we filter client-side.
  const timeRange = useFrameStore((s) => s.globalFilters.timeRange);
  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const filteredData = useMemo(
    () => applyTimeRange(data, (d) => d.bucket_time, resolved),
    [data, resolved],
  );

  const colors = useThemeColors();

  const chartOption = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    const models = [...new Set(filteredData.map((d) => d.model_name))];
    const dates = [...new Set(filteredData.map((d) => d.bucket_time))].sort();

    // X-axis ticks: prefer date-only for day granularity; include the hour
    // for hourly buckets so adjacent ticks don't collapse to the same label.
    const tickFor = (iso: string) => {
      const d = new Date(iso);
      const date = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      if (granularity === 'hour') {
        return `${date} ${String(d.getHours()).padStart(2, '0')}:00`;
      }
      return date;
    };

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'line' as const },
        valueFormatter: (v: number) => `$${v.toFixed(4)}`,
      },
      legend: {
        data: models,
        textStyle: { color: colors.foreground },
        top: 0,
      },
      grid: { top: 34, right: 16, bottom: 28, left: 54 },
      xAxis: {
        type: 'category' as const,
        data: dates.map(tickFor),
        axisLabel: { color: colors.mutedForeground },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Cost (USD)',
        axisLabel: { color: colors.mutedForeground, formatter: '${value}' },
      },
      // Stacked area: each model is an additive layer so the top of the
      // stack reads as total cost over time and each band reads as that
      // model's contribution. Smoothing softens the transitions; the
      // subtle areaStyle opacity lets the palette breathe without the
      // bands turning into a solid wall.
      series: models.map((model, i) => ({
        name: model,
        type: 'line' as const,
        stack: 'total',
        smooth: true,
        showSymbol: false,
        areaStyle: { opacity: 0.55 },
        lineStyle: { width: 1, opacity: 0.9 },
        emphasis: { focus: 'series' as const },
        data: dates.map((date) => {
          const point = filteredData.find(
            (d) => d.bucket_time === date && d.model_name === model,
          );
          return point ? parseFloat(point.total_cost_usd) : 0;
        }),
        itemStyle: { color: colors.chart[i % colors.chart.length] },
      })),
      backgroundColor: 'transparent',
    };
  }, [filteredData, colors, granularity]);

  // Treat the widget as empty when the underlying topic has no data at
  // all. A range filter that clips away everything reads more clearly as
  // "no results for the selected window" than as a blank empty state.
  const hasAnyData = Boolean(data && data.length > 0);
  const filteredIsEmpty = !filteredData || filteredData.length === 0;
  const rangeActive = Boolean(resolved);

  return (
    <ComponentWrapper
      title="Cost Trend"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={!hasAnyData}
      emptyMessage="No cost data available"
      emptyHint="Cost data appears after LLM calls are tracked"
    >
      {hasAnyData && (
        <div style={{ position: 'relative' }}>
          {chartOption && (
            <ReactECharts option={chartOption} style={{ height: '320px' }} notMerge />
          )}
          {filteredIsEmpty && rangeActive && (
            <div
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-3)', fontSize: 13,
              }}
            >
              No cost data in the selected time range
            </div>
          )}
        </div>
      )}
    </ComponentWrapper>
  );
}
