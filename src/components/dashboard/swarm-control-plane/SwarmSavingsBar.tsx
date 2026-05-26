import { Text } from '@/components/ui/typography';
import type { SwarmRunRow } from './swarm-control-plane.types';
import { fmtUsd, fmtPct } from './format';

export function SwarmSavingsBar({ runs }: { runs: SwarmRunRow[] }) {
  if (runs.length === 0) {
    return (
      <Text as="div" size="sm" color="tertiary">
        No savings data. Populate swarm_runs with cost fields from node_projection_swarm.
      </Text>
    );
  }

  const runsWithCost = runs.filter((r) => r.cloud_equivalent_cost_usd > 0 || r.total_cost_usd > 0);
  if (runsWithCost.length === 0) {
    return (
      <Text as="div" size="sm" color="tertiary">
        Cost fields are zero for all runs. Savings bar will render once pricing data is available.
      </Text>
    );
  }

  const totalLocal = runs.reduce((s, r) => s + r.total_cost_usd, 0);
  const totalCloud = runs.reduce((s, r) => s + r.cloud_equivalent_cost_usd, 0);
  const totalSavings = runs.reduce((s, r) => s + r.savings_usd, 0);
  const totalBaseline = Math.max(totalLocal + totalSavings, totalCloud);

  const localPct = totalBaseline > 0 ? (totalLocal / totalBaseline) * 100 : 0;
  const savingsPct = totalBaseline > 0 ? (totalSavings / totalBaseline) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text as="span" size="sm" weight="semibold" color="primary">Actual vs Opus-equivalent cost</Text>
        <Text as="span" size="xs" family="mono" color="ok">
          {fmtPct(totalSavings, totalBaseline)} saved ({fmtUsd(totalSavings)})
        </Text>
      </div>

      {/* Stacked bar: local cost + savings */}
      <div
        style={{
          display: 'flex',
          height: 28,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--line)',
        }}
      >
        {localPct > 0 && (
          <div
            title={`Local cost: ${fmtUsd(totalLocal)}`}
            style={{
              width: `${localPct}%`,
              background: 'var(--color-warn, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: localPct > 8 ? 0 : undefined,
            }}
          >
            {localPct > 12 && (
              <Text as="span" size="xs" family="mono" color="primary">{fmtUsd(totalLocal)}</Text>
            )}
          </div>
        )}
        {savingsPct > 0 && (
          <div
            title={`Savings: ${fmtUsd(totalSavings)}`}
            style={{
              width: `${savingsPct}%`,
              background: 'color-mix(in srgb, var(--color-ok, #22c55e) 30%, transparent)',
              borderLeft: '1px solid var(--color-ok, #22c55e)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {savingsPct > 12 && (
              <Text as="span" size="xs" family="mono" color="ok">{fmtUsd(totalSavings)}</Text>
            )}
          </div>
        )}
      </div>

      {/* Legend + per-run breakdown */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <LegendItem color="var(--color-warn, #f59e0b)" label="Local cost" value={fmtUsd(totalLocal)} />
        <LegendItem color="var(--color-ok, #22c55e)" label="Saved vs cloud" value={fmtUsd(totalSavings)} />
        <LegendItem color="var(--line)" label="Cloud equivalent" value={fmtUsd(totalCloud)} />
      </div>

      {/* Per-run rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {runs.slice(0, 10).map((run) => {
          const runBaseline = Math.max(run.total_cost_usd + run.savings_usd, run.cloud_equivalent_cost_usd);
          const runLocalPct = runBaseline > 0 ? (run.total_cost_usd / runBaseline) * 100 : 0;
          const runSavingsPct = runBaseline > 0 ? (run.savings_usd / runBaseline) * 100 : 0;
          return (
            <div key={run.run_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: '0 0 120px', overflow: 'hidden' }}>
                <Text as="span" size="xs" family="mono" color="tertiary" title={run.run_id}>
                  {run.run_id.slice(0, 8)}…
                </Text>
              </div>
              <div style={{ flex: 1, height: 10, borderRadius: 3, overflow: 'hidden', background: 'var(--panel-2)', border: '1px solid var(--line-2)' }}>
                {runLocalPct > 0 && (
                  <div style={{ width: `${runLocalPct}%`, height: '100%', background: 'var(--color-warn, #f59e0b)', float: 'left' }} />
                )}
                {runSavingsPct > 0 && (
                  <div style={{ width: `${runSavingsPct}%`, height: '100%', background: 'color-mix(in srgb, var(--color-ok, #22c55e) 40%, transparent)', float: 'left' }} />
                )}
              </div>
              <Text as="span" size="xs" family="mono" color={run.savings_usd > 0 ? 'ok' : 'tertiary'} style={{ flex: '0 0 60px', textAlign: 'right' }}>
                {run.savings_usd > 0 ? `−${fmtUsd(run.savings_usd)}` : run.total_cost_usd > 0 ? fmtUsd(run.total_cost_usd) : '-'}
              </Text>
            </div>
          );
        })}
        {runs.length > 10 && (
          <Text as="div" size="xs" color="tertiary">{runs.length - 10} more runs not shown</Text>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
      <Text as="span" size="xs" color="tertiary">{label}:</Text>
      <Text as="span" size="xs" family="mono" color="secondary">{value}</Text>
    </div>
  );
}
