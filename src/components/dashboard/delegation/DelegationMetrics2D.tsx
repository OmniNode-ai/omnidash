// 2D companion to DelegationMetrics3D. Shares the data hook, stats
// panel, and the same parts-of-whole framing — but renders the
// task-type breakdown as a flat SVG donut instead of a tilted three.js
// scene. No WebGL, no rotation, no leader-line skewers; just labelled
// arcs with hover tooltips.
import { useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { useProjectionQuery } from '@/hooks/useProjectionQuery';
import { TOPICS } from '@shared/types/topics';
import { Text } from '@/components/ui/typography';
import { useThemeColors } from '@/theme';
import type { DelegationSummary } from './DelegationMetrics3D';

interface DonutSlice {
  label: string;
  value: number;
  percentage: number;
  color: string;
}

// Donut geometry — viewBox is centred on (0,0) so polar coordinates
// translate directly. With labels moved out to a legend below the
// chart, the viewBox can hug the outer radius (plus a small margin
// for the hover-pop translation).
const VIEWBOX = { x: -100, y: -100, w: 200, h: 200 };
const OUTER_R = 90;
const INNER_R = 50;

function polar(angle: number, r: number): [number, number] {
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

/**
 * SVG path "d" attribute for one annular slice. Math angles measured
 * from +X with positive going counterclockwise; the y-flip below maps
 * those onto SVG's y-down screen space so positive angles read as
 * "up". Callers pass `start > end` to sweep clockwise visually
 * (12 o'clock → right → bottom).
 *
 * Arc sweep flags: SVG's "positive angle direction" (flag 1) is the
 * MATHEMATICAL counterclockwise — which, after our y-flip, reads as
 * visually clockwise on screen. So:
 *   - outer arc (sweep direction): flag 1
 *   - inner arc (returns counter-direction): flag 0
 * Reversing these makes the arc bulge to the wrong side of its chord
 * and the slice ends up looking pinched / star-shaped.
 */
function donutSlicePath(startAngle: number, endAngle: number): string {
  const [x1, y1] = polar(startAngle, OUTER_R);
  const [x2, y2] = polar(endAngle, OUTER_R);
  const [x3, y3] = polar(endAngle, INNER_R);
  const [x4, y4] = polar(startAngle, INNER_R);
  const sweep = Math.abs(endAngle - startAngle);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return [
    `M ${x1} ${-y1}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${largeArc} 1 ${x2} ${-y2}`,
    `L ${x3} ${-y3}`,
    `A ${INNER_R} ${INNER_R} 0 ${largeArc} 0 ${x4} ${-y4}`,
    'Z',
  ].join(' ');
}

export default function DelegationMetrics2D({ config }: { config: Record<string, unknown> }) {
  const showSavings = config.showSavings !== false;
  const showQualityGates = config.showQualityGates !== false;
  const qualityGateThreshold =
    typeof config.qualityGateThreshold === 'number' ? config.qualityGateThreshold : 0.8;

  const { data: dataArr, isLoading, error } = useProjectionQuery<DelegationSummary>({
    topic: TOPICS.delegationSummary,
    queryKey: ['delegation-summary'],
    refetchInterval: 60_000,
  });
  const data = dataArr?.[0];

  const colors = useThemeColors();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Sorted descending by count so the largest slice starts at 12
  // o'clock — matches the 3D variant's reading order.
  const slices = useMemo<DonutSlice[]>(() => {
    if (!data || data.byTaskType.length === 0) return [];
    const total = data.byTaskType.reduce((acc, t) => acc + t.count, 0);
    if (total === 0) return [];
    return data.byTaskType
      .slice()
      .sort((a, b) => b.count - a.count)
      .map((t, i) => ({
        label: t.taskType,
        value: t.count,
        percentage: (t.count / total) * 100,
        color: colors.chart[i % colors.chart.length],
      }));
  }, [data, colors.chart]);

  // Pre-compute slice geometry once per slices change. Keeps the JSX
  // readable and means hover state changes don't re-run the trig.
  const sliceArcs = useMemo(() => {
    if (slices.length === 0) return [];
    const arcs: Array<{ slice: DonutSlice; path: string; midAngle: number }> = [];
    let angle = Math.PI / 2; // 12 o'clock
    const totalPct = slices.reduce((a, s) => a + s.percentage, 0) || 100;
    for (const s of slices) {
      let sweep = (s.percentage / totalPct) * Math.PI * 2;
      if (slices.length === 1) sweep = Math.PI * 2 - 0.001;
      const startAngle = angle;
      const endAngle = angle - sweep;
      const midAngle = (startAngle + endAngle) / 2;
      arcs.push({ slice: s, path: donutSlicePath(startAngle, endAngle), midAngle });
      angle = endAngle;
    }
    return arcs;
  }, [slices]);

  const isEmpty = !data || data.totalDelegations === 0;

  return (
    <ComponentWrapper
      title="Delegation Metrics"
      isLoading={isLoading}
      error={error ?? undefined}
      isEmpty={isEmpty}
      emptyMessage="No delegation events"
      emptyHint="Delegation events appear when tasks are delegated to agents"
    >
      {data && !isEmpty && (
        <div style={{ display: 'flex', gap: '1rem', height: '100%' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div>
              <Text as="div" size="4xl" weight="bold" color="primary">{data.totalDelegations}</Text>
              <Text as="div" size="md" color="primary">Total Delegations</Text>
            </div>
            {showQualityGates && (
              <div>
                <Text as="div" size="4xl" weight="bold" color={data.qualityGatePassRate >= qualityGateThreshold ? 'ok' : 'warn'}>
                  {Math.round(data.qualityGatePassRate * 100)}%
                </Text>
                <Text as="div" size="md" color="primary">Quality Gate Pass Rate</Text>
              </div>
            )}
            {showSavings && (
              <div>
                <Text as="div" size="4xl" weight="bold" color="primary">${data.totalSavingsUsd.toFixed(2)}</Text>
                <Text as="div" size="md" color="primary">Cost Savings</Text>
              </div>
            )}
          </div>
          <div
            data-testid="delegation-2d-donut"
            style={{
              flex: 1,
              minHeight: '150px',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              padding: '0.5rem',
              background: 'var(--panel-2)',
              border: '1px solid var(--line-2)',
              borderRadius: 6,
            }}
            onPointerLeave={() => setHoverIdx(null)}
          >
            <svg
              viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ flex: 1, width: '100%', minHeight: 0, display: 'block' }}
            >
              {sliceArcs.map((arc, i) => {
                const isHover = hoverIdx === i;
                // Pop the hovered slice radially outward by translating
                // along its mid-angle vector — same idea as the 3D
                // hover-pop, just collapsed onto the XY plane.
                const popX = isHover ? Math.cos(arc.midAngle) * 5 : 0;
                const popY = isHover ? -Math.sin(arc.midAngle) * 5 : 0;
                return (
                  <path
                    key={arc.slice.label}
                    d={arc.path}
                    fill={arc.slice.color}
                    stroke="var(--panel-2)"
                    strokeWidth={1}
                    transform={`translate(${popX} ${popY})`}
                    style={{ cursor: 'pointer', transition: 'transform 120ms ease-out' }}
                    onPointerEnter={() => setHoverIdx(i)}
                  />
                );
              })}
            </svg>
            {/*
              Legend below the donut. Replaces the perimeter `<text>`
              labels, which clipped on narrow widget cells. Each chip is
              a clickable hover target that pops the matching slice, so
              the legend doubles as a slice picker. Wraps onto multiple
              rows when the cell is narrow.
            */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '4px 12px',
                justifyContent: 'center',
                paddingTop: 4,
                borderTop: '1px solid var(--line-2)',
              }}
            >
              {sliceArcs.map((arc, i) => (
                <div
                  key={`${arc.slice.label}-legend`}
                  onPointerEnter={() => setHoverIdx(i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.5,
                    transition: 'opacity 120ms ease-out',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: arc.slice.color,
                      flex: '0 0 auto',
                    }}
                  />
                  <Text as="span" size="sm" color="primary">
                    {arc.slice.label}
                  </Text>
                  <Text as="span" size="sm" family="mono" color="secondary" tabularNums>
                    {arc.slice.percentage.toFixed(0)}%
                  </Text>
                </div>
              ))}
            </div>
            {hoverIdx !== null && sliceArcs[hoverIdx] && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  padding: '6px 10px',
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  boxShadow: 'var(--shadow-md)',
                  minWidth: 140,
                  pointerEvents: 'none',
                }}
              >
                <Text as="div" size="sm" family="mono" color="secondary" weight="semibold" style={{ marginBottom: 2 }}>
                  {sliceArcs[hoverIdx].slice.label}
                </Text>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Text as="span" size="sm" family="mono" color="secondary">count</Text>
                  <Text as="span" size="sm" family="mono" tabularNums>{sliceArcs[hoverIdx].slice.value}</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <Text as="span" size="sm" family="mono" color="secondary">share</Text>
                  <Text as="span" size="sm" family="mono" weight="semibold" tabularNums>
                    {sliceArcs[hoverIdx].slice.percentage.toFixed(1)}%
                  </Text>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ComponentWrapper>
  );
}
