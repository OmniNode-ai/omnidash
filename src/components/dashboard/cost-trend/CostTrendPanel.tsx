import { useMemo, useState } from 'react';
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

  // Model list derived from the full dataset (not the time-filtered one)
  // so the legend is stable as the user scrubs the range. A model whose
  // bucket all fall outside the window still appears in the legend — its
  // stacked band is just empty — which keeps the color↔model mapping
  // consistent and avoids the legend flickering on range changes.
  const allModels = useMemo(
    () => (data ? [...new Set(data.map((d) => d.model_name))].sort() : []),
    [data],
  );

  // Models the user has toggled off in the legend. Disabled models are
  // filtered out of the series entirely so the remaining stack re-fits
  // vertically (vs. just hiding them, which leaves their height
  // contribution in place).
  const [disabledModels, setDisabledModels] = useState<Set<string>>(new Set());
  const toggleModel = (model: string) => {
    setDisabledModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const chartOption = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    const visibleModels = allModels.filter((m) => !disabledModels.has(m));
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
      // Built-in legend is hidden — we render a custom HTML legend below
      // the chart so the styling matches the rest of the dashboard and
      // can host more controls in the future (isolate, mute, etc.).
      legend: { show: false },
      grid: { top: 12, right: 16, bottom: 28, left: 54 },
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
      // model's contribution. No emphasis.focus — with an axis-triggered
      // tooltip, series emphasis causes the rest of the stack to dim on
      // hover, which made the chart appear to "isolate" the hovered band
      // and flicker as the mouse moved between series.
      series: visibleModels.map((model) => {
        const colorIdx = allModels.indexOf(model);
        return {
          name: model,
          type: 'line' as const,
          stack: 'total',
          smooth: true,
          showSymbol: false,
          areaStyle: { opacity: 0.55 },
          lineStyle: { width: 1, opacity: 0.9 },
          data: dates.map((date) => {
            const point = filteredData.find(
              (d) => d.bucket_time === date && d.model_name === model,
            );
            return point ? parseFloat(point.total_cost_usd) : 0;
          }),
          itemStyle: { color: colors.chart[colorIdx % colors.chart.length] },
        };
      }),
      backgroundColor: 'transparent',
    };
  }, [filteredData, allModels, disabledModels, colors, granularity]);

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
        <div>
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

          {/* Model legend — below the chart, styled like the 3D widget's
              legend so the two Cost Trend widgets read as a set. Click a
              chip to toggle visibility; no isolate behavior here (the 3D
              widget gets that, 2D doesn't need it). */}
          <div
            style={{
              marginTop: 8,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'flex-start',
              alignContent: 'flex-start',
              flexWrap: 'wrap',
              gap: 8,
              minHeight: 48,
              background: 'var(--panel-2)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)',
              fontSize: 11,
              color: 'var(--ink-2)',
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginRight: 4,
                alignSelf: 'center',
              }}
            >
              Models
            </span>
            {allModels.map((model, i) => {
              const disabled = disabledModels.has(model);
              const color = colors.chart[i % colors.chart.length];
              return (
                <div
                  key={model}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleModel(model)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleModel(model);
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    cursor: 'pointer',
                    opacity: disabled ? 0.45 : 1,
                    userSelect: 'none',
                    background: 'transparent',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: disabled ? 'transparent' : color,
                      border: `1px solid ${color}`,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      textDecoration: disabled ? 'line-through' : 'none',
                      color: 'var(--ink)',
                    }}
                  >
                    {model}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
