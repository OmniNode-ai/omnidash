// T17 (OMN-158): 2D companion to CostByModelPie. Same data, same
// projection topic, same aggregation — but renders as a horizontal bar
// chart, sorted by cost desc, where magnitude is encoded by length
// (perceptually accurate) instead of slice angle (perceptually noisy).
//
// Reuses useThemeColors().chart so this widget and its 3D sibling agree
// on the per-model color in both light and dark themes.
import { useMemo } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useThemeColors } from '@/theme';
import { useFrameStore } from '@/store/store';

interface CostDataPoint {
  bucket_time: string;
  model_name: string;
  total_cost_usd: string;
}

interface ModelBar {
  model: string;
  cost: number;
  percentage: number;
  colorIdx: number;
}

function aggregate(data: CostDataPoint[], colorIdxFor: (model: string) => number): {
  bars: ModelBar[];
  total: number;
} {
  const byModel = new Map<string, number>();
  for (const d of data) {
    const cost = parseFloat(d.total_cost_usd);
    if (!isFinite(cost)) continue;
    byModel.set(d.model_name, (byModel.get(d.model_name) ?? 0) + cost);
  }
  let total = 0;
  for (const v of byModel.values()) total += v;
  const bars: ModelBar[] = [];
  for (const [model, cost] of byModel.entries()) {
    bars.push({
      model,
      cost,
      percentage: total > 0 ? (cost / total) * 100 : 0,
      colorIdx: colorIdxFor(model),
    });
  }
  bars.sort((a, b) => b.cost - a.cost);
  return { bars, total };
}

export default function CostByModelBars({ config: _config }: { config: Record<string, unknown> }) {
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint>({
    topic: TOPICS.llmCost,
    queryKey: ['cost-by-model-2d'],
    refetchInterval: 60_000,
  });

  const timeRange = useFrameStore((s) => s.globalFilters.timeRange);
  const resolved = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const filteredData = useMemo(
    () => applyTimeRange(data, (d) => d.bucket_time, resolved),
    [data, resolved],
  );

  // Stable model→palette-index mapping. Computed off the full
  // (un-range-filtered) dataset so a model keeps its color even if it's
  // filtered out by the current range and later re-enters. Same logic
  // as CostByModelPie so colors line up across the two widgets.
  const colorIdxFor = useMemo(() => {
    const order = [...new Set((data ?? []).map((d) => d.model_name))].sort();
    const map = new Map<string, number>();
    order.forEach((m, i) => map.set(m, i));
    return (model: string) => map.get(model) ?? 0;
  }, [data]);

  const { bars, total } = useMemo(
    () => aggregate(filteredData, colorIdxFor),
    [filteredData, colorIdxFor],
  );

  const colors = useThemeColors();
  const isEmpty = !isLoading && bars.length === 0;
  const max = bars[0]?.cost ?? 0;

  return (
    <ComponentWrapper
      title="Cost by Model"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No cost data available"
      emptyHint="Cost data appears after LLM calls are tracked"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <Text size="3xl" weight="bold" color="primary">${total.toFixed(2)}</Text>
          <Text size="sm" color="secondary">total LLM cost</Text>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
          {bars.map((b) => {
            const fillPct = max > 0 ? (b.cost / max) * 100 : 0;
            const color = colors.chart[b.colorIdx % colors.chart.length] ?? '#888888';
            return (
              <div key={b.model} style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                  <Text family="mono" size="sm" color="primary">{b.model}</Text>
                  <Text family="mono" size="sm" color="secondary">
                    ${b.cost.toFixed(2)} · {b.percentage.toFixed(1)}%
                  </Text>
                </div>
                <div
                  role="meter"
                  aria-label={`${b.model} cost share`}
                  aria-valuenow={Math.round(b.percentage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{
                    width: '100%',
                    height: 10,
                    background: colors.muted,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${fillPct}%`,
                      height: '100%',
                      background: color,
                      transition: 'width 200ms ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ComponentWrapper>
  );
}
