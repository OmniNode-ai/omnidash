// TrendChart primitive — adapter-compliant wrapper over StackedChart.
// Accepts projection-reduced, canonically ordered data via ITrendChartAdapter
// props and maps field declarations to StackedChart's internal StackedSlice shape.
//
// chartType defaults to 'area' (continuous time-series). Override to 'bar' via
// fieldMappings when the projection represents discrete observations (e.g. weekly
// bar histograms). The choice is declared in the manifest fieldMappings, not
// inferred from the data.
//
// Ordering invariant: projectionData MUST already be ordered per orderingAuthority
// (typically bucket_time asc). This adapter does NOT sort — it trusts the contract.
import type React from 'react';
import type { TrendChartFieldMapping, EmptyStateConfig, EmptyStateReason } from '@shared/types/chart-config';
import type { ProjectionOrderingAuthority } from '@shared/types/component-manifest';
import type { ITrendChartAdapter } from '@shared/types/chart-adapter-trend';
import { Text } from '@/components/ui/typography';
import {
  StackedChart,
  type StackedSlice,
} from '../../dashboard/cost-trend/StackedChart';

// ---------- Empty state ----------

const EMPTY_REASON_DEFAULTS: Record<EmptyStateReason, string> = {
  'no-data': 'No data available',
  'missing-field': 'Required field missing from projection data',
  'upstream-blocked': 'Upstream pipeline is blocked',
  'schema-invalid': 'Projection data does not match the declared schema',
};

function resolveEmptyMessage(
  reason: EmptyStateReason,
  emptyState: EmptyStateConfig | undefined,
): string {
  const override = emptyState?.reasons?.[reason];
  if (override) return override.message;
  if (emptyState?.defaultMessage) return emptyState.defaultMessage;
  return EMPTY_REASON_DEFAULTS[reason];
}

interface EmptyStateDisplayProps {
  reason: EmptyStateReason;
  emptyState: EmptyStateConfig | undefined;
}

function EmptyStateDisplay({ reason, emptyState }: EmptyStateDisplayProps) {
  const message = resolveEmptyMessage(reason, emptyState);
  const cta = emptyState?.reasons?.[reason]?.cta;
  return (
    <div
      data-testid="trendchart-empty"
      data-empty-reason={reason}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        minHeight: 120,
        color: 'var(--ink-3, #888)',
        textAlign: 'center',
        gap: 8,
      }}
    >
      <Text as="span" size="sm" color="tertiary">{message}</Text>
      {cta && (
        <Text as="span" size="xs" color="tertiary" style={{ opacity: 0.75 }}>{cta}</Text>
      )}
    </div>
  );
}

// ---------- Data mapping ----------

function buildStackedSlice(
  data: Record<string, unknown>[],
  fieldMappings: TrendChartFieldMapping,
): StackedSlice | null {
  const { x: bucketField, y: valueField, group: groupField } = fieldMappings;

  if (data.length === 0) return null;

  // Collect buckets in their declared (already-ordered) sequence.
  const bucketSet = new Set<string>();
  for (const row of data) {
    const bucket = row[bucketField];
    if (bucket != null) bucketSet.add(String(bucket));
  }
  const buckets = Array.from(bucketSet);
  if (buckets.length === 0) return null;

  let allModels: string[];
  let visibleModels: string[];
  const perModelCost: Record<string, number[]> = {};

  if (groupField) {
    // Multi-series: one series per group value.
    const modelSet = new Set<string>();
    for (const row of data) {
      const g = row[groupField];
      if (g != null) modelSet.add(String(g));
    }
    allModels = Array.from(modelSet);
    visibleModels = allModels;
  } else {
    // Single-series: synthetic group '_value'.
    allModels = ['_value'];
    visibleModels = ['_value'];
  }

  const bucketIdx = new Map(buckets.map((b, i) => [b, i]));

  for (const model of allModels) {
    perModelCost[model] = new Array(buckets.length).fill(0);
  }

  for (const row of data) {
    const bucket = row[bucketField];
    if (bucket == null) continue;
    const bi = bucketIdx.get(String(bucket));
    if (bi === undefined) continue;

    const rawVal = row[valueField];
    const val = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal ?? 0)) || 0;

    if (groupField) {
      const g = row[groupField];
      if (g == null) continue;
      const model = String(g);
      if (perModelCost[model]) perModelCost[model][bi] += val;
    } else {
      perModelCost['_value'][bi] += val;
    }
  }

  // Build cumulative matrix (single pass, bottom-up stack order).
  const cumulative: number[][] = Array.from({ length: buckets.length }, () =>
    new Array(visibleModels.length).fill(0),
  );
  for (let bi = 0; bi < buckets.length; bi++) {
    let running = 0;
    for (let mi = 0; mi < visibleModels.length; mi++) {
      running += perModelCost[visibleModels[mi]][bi];
      cumulative[bi][mi] = running;
    }
  }

  const maxTotal = Math.max(
    ...cumulative.map((row) => row[visibleModels.length - 1] ?? 0),
    0.001,
  );

  return { buckets, visibleModels, cumulative, perModelCost, maxTotal };
}

// ---------- Main component ----------

interface TrendChartProps {
  projectionData: Record<string, unknown>[];
  fieldMappings: TrendChartFieldMapping;
  emptyState?: EmptyStateConfig;
  orderingAuthority?: ProjectionOrderingAuthority;
}

function formatBucketTick(iso: string, granularity: TrendChartFieldMapping['granularity']): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (granularity === 'week') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (granularity === 'day') {
    return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
  }
  // hour
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function TrendChart({
  projectionData,
  fieldMappings,
  emptyState,
}: TrendChartProps): React.ReactElement {
  // Validate required fields are present before mapping.
  if (projectionData.length > 0) {
    const sample = projectionData[0];
    if (!(fieldMappings.x in sample)) {
      return (
        <EmptyStateDisplay reason="missing-field" emptyState={emptyState} />
      );
    }
    if (!(fieldMappings.y in sample)) {
      return (
        <EmptyStateDisplay reason="missing-field" emptyState={emptyState} />
      );
    }
  }

  if (projectionData.length === 0) {
    return <EmptyStateDisplay reason="no-data" emptyState={emptyState} />;
  }

  const stacked = buildStackedSlice(projectionData, fieldMappings);
  if (!stacked) {
    return <EmptyStateDisplay reason="no-data" emptyState={emptyState} />;
  }

  // chartType from fieldMappings — bar for discrete histograms, area (default) for trends.
  // The manifest declares this; we do not infer it from data shape.
  const chartType = (fieldMappings as TrendChartFieldMapping & { chartType?: 'area' | 'bar' }).chartType ?? 'area';
  const allModels = stacked.visibleModels;

  return (
    <div data-testid="trendchart-canvas">
      <StackedChart
        stacked={stacked}
        allModels={allModels}
        formatBucketTick={(iso) => formatBucketTick(iso, fieldMappings.granularity)}
        chartType={chartType}
      />
    </div>
  );
}

// Named export satisfying ITrendChartAdapter interface contract.
// expectAssignable<ITrendChartAdapter>(TrendChartThreeJs) in tests.
export const TrendChartThreeJs: ITrendChartAdapter = TrendChart as ITrendChartAdapter;
