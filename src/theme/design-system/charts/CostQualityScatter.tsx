/**
 * OMN-22168 AC3: the cost-versus-quality scatter of the Usage page. Moved from src/pages/local/usage-analysis.tsx with
 * the markup unchanged. A point is a group with both a measured cost per run and a pass rate; point area is runs. With
 * nothing measured there are no axes and no $0 ticks, only the list of what could not be drawn.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChartTable } from './frame';

export interface ScatterPoint { key: string; name: string; cost: number; rate: number; runs: number; color: string; detail: string }

const W = 640, H = 260, INSET = 24, PAD = { left: 56, right: 200, top: 24, bottom: 40 };

function CostQualityScatterPlot({ label, points, unplotted, formatCost, legend }: {
  label: string;
  points: readonly ScatterPoint[];
  /** The names that could not be drawn (no measured cost or no verdicts). */
  unplotted: readonly string[];
  formatCost: (value: number) => string;
  legend?: ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);
  if (points.length === 0) return <figure className="local-chart usage-analysis-quality" aria-label={label}>
    <p className="local-dashboard-caption" data-quality-unplotted>No model has both a measured cost and a verdict yet{unplotted.length > 0 ? `: ${unplotted.join(', ')}` : ''}</p>
  </figure>;
  const maxCost = Math.max(...points.map(point => point.cost), 0);
  // The plot starts INSET past the axes so a point at $0 or at 100% never sits on an axis label or leaves the frame.
  const x = (value: number) => PAD.left + INSET + (maxCost === 0 ? 0 : (value / maxCost) * (W - PAD.left - INSET - PAD.right));
  const y = (rate: number) => PAD.top + INSET + (1 - rate) * (H - PAD.top - INSET - PAD.bottom);
  const maxRuns = Math.max(1, ...points.map(point => point.runs));
  return <figure className="local-chart usage-analysis-quality" aria-label={label}>
    <figcaption className="local-dashboard-caption">Cost per measured run against quality pass rate; point area is runs</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={label}>
      <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="usage-analysis-axis" />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} className="usage-analysis-axis" />
      {[0, 0.5, 1].map(rate => <text key={rate} x={PAD.left - 8} y={y(rate) + 4} textAnchor="end" className="usage-analysis-tick">{`${rate * 100}%`}</text>)}
      <text x={x(0)} y={H - 12} textAnchor="middle" className="usage-analysis-tick">{formatCost(0)}</text>
      <text x={x(maxCost)} y={H - 12} textAnchor="middle" className="usage-analysis-tick">{formatCost(maxCost)}</text>
      {points.map(point => {
        const radius = 5 + 13 * Math.sqrt(point.runs / maxRuns);
        // The same words on hover and keyboard focus (the readout under the chart), not only for screen readers.
        return <g key={point.key}>
          <circle data-quality-point={point.name} data-cost={String(point.cost)} cx={x(point.cost)} cy={y(point.rate)} r={radius} tabIndex={0}
            role="img" aria-label={point.detail} onMouseEnter={() => setActive(point.detail)} onFocus={() => setActive(point.detail)}
            onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}
            style={{ '--point-color': point.color } as CSSProperties}><title>{point.detail}</title></circle>
          <text x={x(point.cost) + radius + 4} y={y(point.rate) + 4} className="usage-analysis-point-name">{point.name}</text>
        </g>;
      })}
    </svg>
    <p className="local-dashboard-caption usage-analysis-readout" data-quality-readout aria-hidden="true">{active ?? ''}</p>
    {unplotted.length > 0 && <p className="local-dashboard-caption" data-quality-unplotted>
      Not drawn (no measured cost or no verdicts): {unplotted.join(', ')}</p>}
    {legend}
  </figure>;
}

/** OMN-23330 AC37: the chart, with its "Show as table" toggle over the same rows and values. */
export function CostQualityScatter(props: Parameters<typeof CostQualityScatterPlot>[0]) {
  return <ChartTable label={props.label} shape="scatter" columns={['Model', 'Cost', 'Pass rate', 'Runs']}
    rows={props.points.map(point => [point.name, point.cost, point.rate, point.runs])}>
    <CostQualityScatterPlot {...props} />
  </ChartTable>;
}
