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
  free: 'var(--color-good, #22c55e)',
  cheap: 'var(--color-warn, #f59e0b)',
  expensive: 'var(--color-bad, #ef4444)',
};

interface BarRow {
  name: string;
  cost: number;
  tier: CostTier;
  widthPct: number;
  savingsVsMax: number | null;
}

function buildRows(data: unknown[], contract: VisualizationContract): BarRow[] {
  const costField = contract.cost_field;
  const nameField = contract.display_name_field;

  const rows = data
    .map((d) => {
      const row = d as Record<string, unknown>;
      const cost = parseFloat(String(row[costField] ?? '0'));
      const name = String(row[nameField] ?? row[costField] ?? '');
      return { name, cost };
    })
    .filter((r) => isFinite(r.cost));

  rows.sort((a, b) => a.cost - b.cost);

  const maxCost = rows.length > 0 ? Math.max(...rows.map((r) => r.cost)) : 0;
  const minNonZero = rows.find((r) => r.cost > 0)?.cost ?? 0;
  const scale = maxCost > 0 ? maxCost : 1;

  return rows.map((r) => ({
    name: r.name,
    cost: r.cost,
    tier: costTier(r.cost),
    widthPct: Math.max(2, (r.cost / scale) * 100),
    savingsVsMax:
      r.cost > 0 && maxCost > 0 && r.cost < maxCost && minNonZero === r.cost
        ? maxCost - r.cost
        : null,
  }));
}

interface CostBarChartProps {
  data: unknown[];
  contract: VisualizationContract;
}

export function CostBarChart({ data, contract }: CostBarChartProps) {
  const rows = buildRows(data, contract);

  if (rows.length === 0) {
    return (
      <Text as="div" size="lg" color="tertiary">
        No cost data to display
      </Text>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
      {rows.map((row) => (
        <div key={row.name} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text as="span" size="sm" family="mono" truncate style={{ maxWidth: '60%' }} title={row.name}>
              {row.name}
            </Text>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Text as="span" size="sm" family="mono" tabularNums>
                ${row.cost.toFixed(4)}
              </Text>
              {row.savingsVsMax !== null && (
                <Text as="span" size="xs" family="mono" color="secondary">
                  saves ${row.savingsVsMax.toFixed(4)}
                </Text>
              )}
            </div>
          </div>
          <div
            style={{
              height: 12,
              background: 'var(--panel-2)',
              borderRadius: 3,
              overflow: 'hidden',
              border: '1px solid var(--line-2)',
            }}
          >
            <div
              data-testid={`bar-${row.name}`}
              data-tier={row.tier}
              style={{
                height: '100%',
                width: `${row.widthPct}%`,
                background: TIER_COLOR[row.tier],
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

registerViz('bar_chart', {
  render({ data, contract }) {
    return <CostBarChart data={data} contract={contract} />;
  },
});
