import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import { fmtDate, fmtMs, fmtTokens, fmtUsd, shortId } from './format';
import { HonestyStateBadge, deriveHonestyState } from './HonestyStateBadge';
import type { DelegationEvidenceSnapshot, DelegationRun } from './delegation-control-plane.types';

export function DelegationRunHeader({
  snapshot,
  selectedRun,
}: {
  snapshot: DelegationEvidenceSnapshot;
  selectedRun: DelegationRun | null;
}) {
  const honestyState = deriveHonestyState(snapshot);
  const passed = snapshot.runs.filter((run) => run.status === 'passed').length;
  const failed = snapshot.runs.filter((run) => run.status === 'failed').length;
  const projected = snapshot.runs.filter((run) => run.status === 'projected').length;
  const provisioned = snapshot.probes.filter((probe) => probe.provisioned === true).length;
  const stale = snapshot.probes.filter((probe) => probe.provisioned === false).length;
  const qualityPassRate = asNumber(snapshot.qualityGate?.overall_pass_rate);
  const savingsUsd = asNumber(snapshot.savings?.cumulative_savings_usd);
  const totalTokens = asNumber(snapshot.tokenUsage?.total_tokens);
  const latencyMs = asNumber(selectedRun?.latencyMs);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Text as="div" size="lg" weight="semibold" color="primary">
              Delegation evidence control plane
            </Text>
            <HonestyStateBadge state={honestyState} />
          </div>
          <Text as="div" size="sm" color="secondary">
            Selected run {shortId(selectedRun?.correlationId)} - {selectedRun?.taskType ?? 'waiting for projection rows'}
          </Text>
        </div>
        <div style={{ textAlign: 'right' }}>
          <Text as="div" size="xs" color="tertiary">
            Latest projection
          </Text>
          <Text as="div" size="sm" family="mono" color="secondary">
            {fmtDate(snapshot.probes.map((p) => p.capturedAt).filter(Boolean).sort().at(-1))}
          </Text>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
        <KPI label="Runs" value={snapshot.runs.length} caption={`${passed} pass / ${failed} fail / ${projected} projected`} />
        <KPI label="Quality pass" value={Math.round(qualityPassRate * 100)} suffix="%" tone={qualityPassRate >= 0.8 ? 'good' : 'warn'} />
        <KPI label="Savings" value={savingsUsd} prefix="$" decimals={4} tone="good" caption={snapshot.savings?.pricing_manifest_version ?? 'pricing pending'} />
        <KPI label="Tokens" value={totalTokens} caption={fmtTokens(totalTokens)} />
        <KPI label="Latency" value={latencyMs} suffix="ms" caption={fmtMs(latencyMs)} />
        <KPI label="Live probes" value={provisioned} caption={stale > 0 ? `${stale} unprovisioned` : `${snapshot.probes.length} topics`} tone={stale > 0 ? 'warn' : 'default'} />
      </div>

      {selectedRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <MiniFact label="Model" value={selectedRun.modelName} />
          <MiniFact label="Status" value={selectedRun.status} tone={selectedRun.status === 'failed' ? 'bad' : selectedRun.status === 'passed' ? 'ok' : 'secondary'} />
          <MiniFact label="Cost" value={fmtUsd(selectedRun.estimatedCostUsd)} />
          <MiniFact label="Routing" value={selectedRun.routingRule ?? 'projection inferred'} />
        </div>
      )}
    </section>
  );
}

function MiniFact({ label, value, tone = 'secondary' }: { label: string; value: string; tone?: 'secondary' | 'ok' | 'bad' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Text as="div" size="xs" color="tertiary">
        {label}
      </Text>
      <Text as="div" size="sm" family="mono" color={tone} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </Text>
    </div>
  );
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
