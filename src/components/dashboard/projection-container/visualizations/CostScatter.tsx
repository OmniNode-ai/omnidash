import { Text } from '@/components/ui/typography';
import type { VisualizationContract } from '@shared/types/visualization-contract';
import { registerViz } from '../viz-registry';

type CostTier = 'free' | 'cheap' | 'expensive';

function costTier(cost: number): CostTier {
  if (cost === 0) return 'free';
  if (cost < 0.01) return 'cheap';
  return 'expensive';
}

const TIER_COLOR: Record<CostTier, string> = {
  free: '#22c55e',
  cheap: '#f59e0b',
  expensive: '#ef4444',
};

const SVG_W = 480;
const SVG_H = 320;
const MARGIN = { top: 20, right: 30, bottom: 50, left: 60 };
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;

const DOT_MIN = 5;
const DOT_MAX = 18;

interface ScatterPoint {
  name: string;
  cost: number;
  latency: number;
  tokens: number;
  tier: CostTier;
  cx: number;
  cy: number;
  r: number;
}

function buildPoints(data: unknown[], contract: VisualizationContract): ScatterPoint[] {
  const costField = contract.cost_field;
  const latencyField = contract.latency_field;
  const nameField = contract.display_name_field;

  const raw = data
    .map((d) => {
      const row = d as Record<string, unknown>;
      const cost = parseFloat(String(row[costField] ?? '0'));
      const latency = parseFloat(String(row[latencyField] ?? '0'));
      const tokens = parseFloat(String(row['total_tokens'] ?? row['tokens'] ?? '100'));
      const name = String(row[nameField] ?? '');
      return { name, cost, latency, tokens };
    })
    .filter((r) => isFinite(r.cost) && isFinite(r.latency));

  if (raw.length === 0) return [];

  const maxCost = Math.max(...raw.map((r) => r.cost), 0.0001);
  const maxLatency = Math.max(...raw.map((r) => r.latency), 1);
  const maxTokens = Math.max(...raw.map((r) => r.tokens), 1);

  return raw.map((r) => {
    const cx = (r.latency / maxLatency) * PLOT_W;
    const cy = PLOT_H - (r.cost / maxCost) * PLOT_H;
    const tokenRatio = r.tokens / maxTokens;
    const radius = DOT_MIN + tokenRatio * (DOT_MAX - DOT_MIN);
    return {
      name: r.name,
      cost: r.cost,
      latency: r.latency,
      tokens: r.tokens,
      tier: costTier(r.cost),
      cx,
      cy,
      r: radius,
    };
  });
}

function formatCost(v: number): string {
  return `$${v.toFixed(4)}`;
}

function formatLatency(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v.toFixed(0)}ms`;
}

interface CostScatterProps {
  data: unknown[];
  contract: VisualizationContract;
}

export function CostScatter({ data, contract }: CostScatterProps) {
  const points = buildPoints(data, contract);

  if (points.length === 0) {
    return (
      <Text as="div" size="lg" color="tertiary">
        No data to display
      </Text>
    );
  }

  const maxLatency = Math.max(...points.map((p) => (p.latency / PLOT_W) * PLOT_W), 1);
  const maxCost = Math.max(...points.map((p) => p.cost), 0.0001);

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    x: t * PLOT_W,
    label: formatLatency(t * maxLatency),
  }));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    y: PLOT_H - t * PLOT_H,
    label: formatCost(t * maxCost),
  }));

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        width={SVG_W}
        height={SVG_H}
        role="img"
        aria-label="Cost vs Latency scatter plot"
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* Grid lines */}
          {yTicks.map((t) => (
            <line
              key={t.y}
              x1={0}
              y1={t.y}
              x2={PLOT_W}
              y2={t.y}
              stroke="var(--line-2)"
              strokeWidth={1}
            />
          ))}
          {xTicks.map((t) => (
            <line
              key={t.x}
              x1={t.x}
              y1={0}
              x2={t.x}
              y2={PLOT_H}
              stroke="var(--line-2)"
              strokeWidth={1}
            />
          ))}

          {/* Y axis ticks */}
          {yTicks.map((t) => (
            <text
              key={t.y}
              x={-6}
              y={t.y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--text-3)"
              fontFamily="var(--font-mono)"
            >
              {t.label}
            </text>
          ))}

          {/* X axis ticks */}
          {xTicks.map((t) => (
            <text
              key={t.x}
              x={t.x}
              y={PLOT_H + 16}
              textAnchor="middle"
              fontSize={10}
              fill="var(--text-3)"
              fontFamily="var(--font-mono)"
            >
              {t.label}
            </text>
          ))}

          {/* Axis labels */}
          <text
            x={PLOT_W / 2}
            y={PLOT_H + 38}
            textAnchor="middle"
            fontSize={11}
            fill="var(--text-2)"
            fontFamily="var(--font-mono)"
          >
            Latency
          </text>
          <text
            x={-PLOT_H / 2}
            y={-44}
            textAnchor="middle"
            fontSize={11}
            fill="var(--text-2)"
            fontFamily="var(--font-mono)"
            transform="rotate(-90)"
          >
            Cost
          </text>

          {/* Data points */}
          {points.map((p) => (
            <g key={p.name} data-testid={`dot-${p.name}`} data-tier={p.tier}>
              <circle
                cx={p.cx}
                cy={p.cy}
                r={p.r}
                fill={TIER_COLOR[p.tier]}
                fillOpacity={0.8}
                stroke="var(--panel)"
                strokeWidth={1.5}
              />
              <text
                x={p.cx + p.r + 3}
                y={p.cy}
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--text-2)"
                fontFamily="var(--font-mono)"
              >
                {p.name}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line x1={0} y1={0} x2={0} y2={PLOT_H} stroke="var(--line)" strokeWidth={1} />
          <line x1={0} y1={PLOT_H} x2={PLOT_W} y2={PLOT_H} stroke="var(--line)" strokeWidth={1} />
        </g>
      </svg>
    </div>
  );
}

registerViz('scatter_plot', {
  render({ data, contract }) {
    return <CostScatter data={data} contract={contract} />;
  },
});
