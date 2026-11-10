/**
 * DoughnutChartAdapter — manifest-dispatchable adapter for the 3D pie chart.
 *
 * Implements IDoughnutChartAdapter. Accepts pre-reduced projection rows via adapter
 * props, aggregates by the declared label/value fields, then delegates rendering to
 * ThreePieChart (exported from CostByModelPie — the pure three.js rendering primitive).
 *
 * Decision (plan Task 9 / Edit 1): ThreePieChart stays as the pure rendering component.
 * This adapter IS the manifest-dispatch layer: it maps fieldMappings → ModelSlice[] and
 * passes to ThreePieChart. It never fetches data or applies time-range filters.
 */
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { ComponentWrapper } from '@/components/dashboard/ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useThemeName } from '@/theme';
import {
  ThreePieChart,
  type ModelSlice,
} from '@/components/dashboard/cost-by-model/CostByModelPie';
import type {
  IDoughnutChartAdapter,
  DoughnutChartAdapterProps,
} from '@shared/types/chart-adapter-doughnut';
import { useTokenColors } from '@/theme/design-system/useTokenColors';
import { fixed as fmtFixed } from '@/lib/format';
// OMN-23330 AC25: this file's fixed inline styles are classes in DoughnutChartAdapter.static.css.
import './DoughnutChartAdapter.static.css';

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildSlices(
  rows: Record<string, unknown>[],
  labelField: string,
  valueField: string,
): ModelSlice[] {
  const byLabel = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[labelField] ?? '');
    const val = toFiniteNumber(row[valueField]) ?? 0;
    byLabel.set(label, (byLabel.get(label) ?? 0) + val);
  }
  let total = 0;
  for (const v of byLabel.values()) total += v;
  // Stable color index: alphabetical sort of all model names seen.
  const colorOrder = [...byLabel.keys()].sort();
  const colorMap = new Map(colorOrder.map((k, i) => [k, i]));
  const slices: ModelSlice[] = [...byLabel.entries()].map(([model, cost]) => ({
    model,
    cost,
    percentage: total > 0 ? (cost / total) * 100 : 0,
    colorIdx: colorMap.get(model) ?? 0,
  }));
  slices.sort((a, b) => b.cost - a.cost);
  return slices;
}

export function DoughnutChartAdapter<T extends Record<string, unknown> = Record<string, unknown>>(
  props: DoughnutChartAdapterProps<T>,
): ReactElement {
  const { projectionData, fieldMappings, emptyState } = props;
  const { label: labelField, value: valueField } = fieldMappings;

  const rows = projectionData as Record<string, unknown>[];
  const colors = useTokenColors();
  const themeName = useThemeName();

  const slices = useMemo(
    () => buildSlices(rows, labelField, valueField),
    [rows, labelField, valueField],
  );

  const total = useMemo(() => slices.reduce((s, r) => s + r.cost, 0), [slices]);
  const isEmpty = rows.length === 0;
  const emptyMessage = emptyState?.defaultMessage ?? 'No data available';

  return (
    <ComponentWrapper
      title="Cost by Model"
      isLoading={false}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
    >
      <div className="doughnut-chart-adapter-s20c727"
      >
        <div className="doughnut-chart-adapter-sa33155">
          <ThreePieChart
            slices={slices}
            chartColors={colors.chart}
            themeName={themeName}
          />
          {slices.length === 0 && rows.length > 0 && (
            <div className="doughnut-chart-adapter-sacccc4"
            >
              <Text size="lg" color="tertiary">No data in the selected range</Text>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="doughnut-chart-adapter-s305b44"
        >
          <Text className="doughnut-chart-adapter-s3eaa7b"
            as="div"
            size="xs"
            family="mono"
            color="tertiary"
            transform="uppercase"
          >
            Models
          </Text>
          {slices.map((s) => {
            const color = colors.chart[s.colorIdx % colors.chart.length];
            return (
              <div className="doughnut-chart-adapter-s4363d3"
                key={s.model}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: color,
                    border: `1px solid ${color}`,
                    flexShrink: 0,
                  }}
                />
                <Text className="doughnut-chart-adapter-see3d55"
                  as="span"
                  size="sm"
                  family="mono"
                  truncate
                  title={s.model}
                >
                  {s.model}
                </Text>
                <Text as="span" size="xs" family="mono" color="secondary" tabularNums>
                  {fmtFixed(s.percentage, 1)}%
                </Text>
              </div>
            );
          })}
          {total > 0 && (
            <div className="doughnut-chart-adapter-s7856ab"
            >
              <Text as="span" size="sm" family="mono" color="secondary">total</Text>
              <Text as="span" size="sm" family="mono" weight="semibold" tabularNums>
                ${fmtFixed(total, 2)}
              </Text>
            </div>
          )}
        </div>
      </div>
    </ComponentWrapper>
  );
}

// Compile-time proof that DoughnutChartAdapter satisfies IDoughnutChartAdapter.
const _typeCheck: IDoughnutChartAdapter = DoughnutChartAdapter;
void _typeCheck;

/** Named alias used by the adapter resolver. */
export const DoughnutChartAdapterThreeJs: IDoughnutChartAdapter = DoughnutChartAdapter as IDoughnutChartAdapter;
