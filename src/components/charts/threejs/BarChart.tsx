/**
 * BarChart — three.js bar chart primitive implementing IBarChartAdapter.
 *
 * Wraps StackedChart with chartType="bar". Maps BarChartFieldMapping fields
 * (x, y, optional group) to StackedChart's StackedSlice data shape.
 *
 * Renders configured empty states per EmptyStateReason. Does NOT collapse
 * schema-invalid into no-data — each reason gets a distinct message.
 *
 * Adapter input contract: projectionData is pre-reduced, canonically ordered,
 * and contract-valid. This component maps fields and renders ONLY.
 */
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { StackedChart } from '@/components/dashboard/cost-trend/StackedChart';
import type { StackedSlice } from '@/components/dashboard/cost-trend/StackedChart';
import { Text } from '@/components/ui/typography';
import type { IBarChartAdapter, BarChartAdapterProps } from '@shared/types/chart-adapter-bar';
import type { EmptyStateReason } from '@shared/types/chart-config';

const DEFAULT_EMPTY_MESSAGES: Record<EmptyStateReason, string> = {
  'no-data': 'No data available',
  'missing-field': 'Required field missing from projection data',
  'upstream-blocked': 'Upstream pipeline blocked — data not yet available',
  'schema-invalid': 'Projection data failed schema validation',
};

function detectEmptyReason(
  projectionData: Record<string, unknown>[],
  xField: string,
  yField: string,
): EmptyStateReason | null {
  if (projectionData.length === 0) return 'no-data';
  const sample = projectionData[0];
  if (!(xField in sample) || !(yField in sample)) return 'missing-field';
  const yVal = sample[yField];
  if (typeof yVal !== 'number' && typeof yVal !== 'string') return 'schema-invalid';
  return null;
}

function buildStackedSlice(
  projectionData: Record<string, unknown>[],
  xField: string,
  yField: string,
  groupField: string | undefined,
): StackedSlice {
  // Collect all group values (or default "value" if no groupBy).
  const groupValues = groupField
    ? [...new Set(projectionData.map((r) => String(r[groupField] ?? '')))]
    : ['value'];

  // Collect x-axis buckets in projection order.
  const bucketOrder: string[] = [];
  const seen = new Set<string>();
  for (const row of projectionData) {
    const bucket = String(row[xField] ?? '');
    if (!seen.has(bucket)) {
      seen.add(bucket);
      bucketOrder.push(bucket);
    }
  }

  // Build perModelCost: group → bucket array of numeric y values.
  const perModelCost: Record<string, number[]> = {};
  for (const g of groupValues) {
    perModelCost[g] = new Array<number>(bucketOrder.length).fill(0);
  }

  const bucketIndex = new Map(bucketOrder.map((b, i) => [b, i]));

  for (const row of projectionData) {
    const bucket = String(row[xField] ?? '');
    const bIdx = bucketIndex.get(bucket);
    if (bIdx === undefined) continue;
    const groupKey = groupField ? String(row[groupField] ?? '') : 'value';
    const yRaw = row[yField];
    const yVal = typeof yRaw === 'number' ? yRaw : parseFloat(String(yRaw ?? 0));
    if (!isNaN(yVal)) {
      perModelCost[groupKey][bIdx] = (perModelCost[groupKey][bIdx] ?? 0) + yVal;
    }
  }

  // Build cumulative array [bucketIdx][groupIdx].
  const cumulative: number[][] = bucketOrder.map((_, bIdx) => {
    let running = 0;
    return groupValues.map((g) => {
      running += perModelCost[g][bIdx] ?? 0;
      return running;
    });
  });

  const maxTotal = Math.max(
    1,
    ...bucketOrder.map((_, bIdx) => cumulative[bIdx][groupValues.length - 1] ?? 0),
  );

  return {
    buckets: bucketOrder,
    visibleModels: groupValues,
    cumulative,
    perModelCost,
    maxTotal,
  };
}

export function BarChart<T extends Record<string, unknown> = Record<string, unknown>>(
  props: BarChartAdapterProps<T>,
): ReactElement {
  const { projectionData, fieldMappings, emptyState } = props;
  const { x: xField, y: yField, group: groupField } = fieldMappings;

  const rows = projectionData as Record<string, unknown>[];

  const emptyReason = useMemo(
    () => detectEmptyReason(rows, xField, yField),
    [rows, xField, yField],
  );

  // Always call hooks unconditionally; use emptyReason to guard the render path.
  const stacked = useMemo(
    () =>
      emptyReason === null
        ? buildStackedSlice(rows, xField, yField, groupField)
        : null,
    [emptyReason, rows, xField, yField, groupField],
  );

  if (emptyReason !== null) {
    const reasonConfig = emptyState?.reasons?.[emptyReason];
    const message =
      reasonConfig?.message ?? emptyState?.defaultMessage ?? DEFAULT_EMPTY_MESSAGES[emptyReason];

    return (
      <div
        data-testid="barchart-canvas"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 200,
          gap: 8,
        }}
      >
        <Text data-empty-reason={emptyReason}>{message}</Text>
        {reasonConfig?.cta && (
          <Text style={{ opacity: 0.6 }}>{reasonConfig.cta}</Text>
        )}
      </div>
    );
  }

  // stacked is non-null here because emptyReason === null
  const allModels = stacked!.visibleModels;

  const formatBucketTick = (bucket: string): string => {
    // Attempt ISO date parse for friendly labels; fall back to raw string.
    const d = new Date(bucket);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    return bucket;
  };

  return (
    <div data-testid="barchart-canvas" style={{ width: '100%' }}>
      <StackedChart
        stacked={stacked!}
        allModels={allModels}
        formatBucketTick={formatBucketTick}
        chartType="bar"
      />
    </div>
  );
}

// Compile-time proof that BarChart satisfies IBarChartAdapter.
// If this assignment fails to typecheck, the component no longer conforms.
const _typeCheck: IBarChartAdapter = BarChart;
void _typeCheck;
