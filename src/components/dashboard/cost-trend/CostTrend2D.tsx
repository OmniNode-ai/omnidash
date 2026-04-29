import { useEffect, useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { applyTimeRange, resolveTimeRange } from '@/hooks/useTimeRange';
import { useTimezone } from '@/hooks/useTimezone';
import { useThemeColors } from '@/theme';
import { useFrameStore } from '@/store/store';
import { Text } from '@/components/ui/typography';
import { zonedComponents } from '@/lib/zonedComponents';
import { StackedChart, type StackedSlice, type ChartType } from './StackedChart';

export interface CostDataPoint {
  bucket_time: string;
  model_name: string;
  total_cost_usd: string;
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  request_count?: number;
}

/**
 * Internal config shape for the 2D Cost Trend renderer. Post-merge this
 * is no longer the public surface — the unified `CostTrend.tsx` router
 * owns the externally-visible config and forwards `style` (its public
 * field) as `chartType` (this file's existing local field name).
 *
 * Direct consumers should configure `style` on the merged widget via
 * the dashboard config panel; `chartType` here is router-driven and
 * not part of the manifest's `configSchema`.
 */
interface CostTrendConfig {
  granularity?: 'hour' | 'day';
  chartType?: ChartType;
  showBudgetLine?: boolean;
}

function buildStacked(
  data: CostDataPoint[],
  allModels: string[],
  disabledModels: Set<string>,
): StackedSlice | null {
  if (!data || data.length === 0) return null;
  const visibleModels = allModels.filter((m) => !disabledModels.has(m));
  if (visibleModels.length === 0) return null;
  const buckets = [...new Set(data.map((d) => d.bucket_time))].sort();

  // Index raw data by (bucket, model) → cost so we can look up quickly
  // and default missing cells to 0 without another pass.
  const byKey = new Map<string, number>();
  for (const d of data) {
    const cost = parseFloat(d.total_cost_usd);
    if (!isFinite(cost)) continue;
    byKey.set(`${d.bucket_time}|${d.model_name}`, cost);
  }
  const perModelCost: Record<string, number[]> = {};
  for (const m of visibleModels) {
    const arr = new Array(buckets.length).fill(0);
    for (let i = 0; i < buckets.length; i++) {
      arr[i] = byKey.get(`${buckets[i]}|${m}`) ?? 0;
    }
    perModelCost[m] = arr;
  }
  const cumulative: number[][] = [];
  let maxTotal = 0;
  for (let i = 0; i < buckets.length; i++) {
    const row: number[] = [];
    let sum = 0;
    for (let j = 0; j < visibleModels.length; j++) {
      sum += perModelCost[visibleModels[j]][i];
      row.push(sum);
    }
    cumulative.push(row);
    if (sum > maxTotal) maxTotal = sum;
  }
  return {
    buckets,
    visibleModels,
    cumulative,
    perModelCost,
    maxTotal: maxTotal > 0 ? maxTotal : 1,
  };
}

export default function CostTrendPanel({ config }: { config: CostTrendConfig }) {
  const granularity = config.granularity || 'hour';
  const chartType: ChartType = config.chartType === 'bar' ? 'bar' : 'area';
  // M1 (review §4): bucket-tick labels read the dashboard-level
  // timezone via zonedComponents() so they don't disagree with the rest
  // of the dashboard once the user picks a non-browser zone.
  const tz = useTimezone();
  const { data, isLoading, error } = useProjectionQuery<CostDataPoint>({
    topic: TOPICS.llmCost,
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
  // buckets all fall outside the window still appears in the legend —
  // its stacked band is just empty — which keeps the color↔model mapping
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

  // Shift-click on a legend pill solos that model — the stack
  // collapses to a single series. Independent of the disabled set, so
  // clearing isolation restores whatever the user had toggled before.
  const [isolatedModel, setIsolatedModel] = useState<string | null>(null);

  // Drop isolation when the underlying model list no longer includes
  // the isolated model (e.g., dataset refresh drops that model).
  useEffect(() => {
    if (isolatedModel && !allModels.includes(isolatedModel)) {
      setIsolatedModel(null);
    }
  }, [isolatedModel, allModels]);

  const effectiveDisabled = useMemo(() => {
    if (!isolatedModel) return disabledModels;
    const s = new Set<string>();
    for (const m of allModels) if (m !== isolatedModel) s.add(m);
    return s;
  }, [isolatedModel, disabledModels, allModels]);

  const stacked = useMemo(
    () => buildStacked(filteredData, allModels, effectiveDisabled),
    [filteredData, allModels, effectiveDisabled],
  );

  const formatBucketTick = (iso: string): string => {
    const c = zonedComponents(new Date(iso), tz);
    const date = `${c.month}/${c.day}`;
    if (granularity === 'hour') {
      return `${date} ${c.hour}:00`;
    }
    return date;
  };

  // Treat the widget as empty when the underlying topic has no data at
  // all. A range filter that clips away everything reads more clearly as
  // "no results for the selected window" than as a blank empty state.
  const hasAnyData = Boolean(data && data.length > 0);
  const rangeActive = Boolean(resolved);
  const showNoDataInRange = hasAnyData && stacked === null;

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
            {stacked ? (
              <StackedChart
                stacked={stacked}
                allModels={allModels}
                formatBucketTick={formatBucketTick}
                chartType={chartType}
                height={320}
              />
            ) : (
              <div
                style={{
                  height: 320,
                  borderRadius: 6,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line-2)',
                }}
              />
            )}
            {showNoDataInRange && (
              <div
                style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text size="lg" color="tertiary">
                  {rangeActive
                    ? 'No cost data in the selected time range'
                    : 'All models are hidden'}
                </Text>
              </div>
            )}
          </div>

          {/* Model legend — below the chart, styled like the 3D widget's
              legend so the two Cost Trend widgets read as a set. Plain
              click toggles visibility; shift-click solos the model
              (same semantics as shift-click on a bar in the 3D widget). */}
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
            }}
          >
            <Text
              size="xs"
              color="tertiary"
              family="mono"
              transform="uppercase"
              style={{ marginRight: 4, alignSelf: 'center' }}
            >
              Models
            </Text>
            {allModels.map((model, i) => {
              const disabled = disabledModels.has(model);
              const isolated = isolatedModel === model;
              const color = colors.chart[i % colors.chart.length];
              return (
                <div
                  key={model}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      setIsolatedModel(isolated ? null : model);
                      return;
                    }
                    toggleModel(model);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (e.shiftKey) {
                        setIsolatedModel(isolated ? null : model);
                      } else {
                        toggleModel(model);
                      }
                    }
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 8px',
                    borderRadius: 12,
                    border: `1px solid ${isolated ? color : 'var(--line)'}`,
                    cursor: 'pointer',
                    opacity: disabled ? 0.45 : 1,
                    userSelect: 'none',
                    background: isolated ? `${color}22` : 'transparent',
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
                  <Text
                    size="sm"
                    family="mono"
                    color={isolated ? 'inherit' : 'primary'}
                    weight={isolated ? 'semibold' : 'regular'}
                    style={{
                      textDecoration: disabled ? 'line-through' : 'none',
                      ...(isolated ? { color } : {}),
                    }}
                  >
                    {model}
                  </Text>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
