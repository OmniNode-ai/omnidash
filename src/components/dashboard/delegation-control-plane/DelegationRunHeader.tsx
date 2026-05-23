import { Text } from '@/components/ui/typography';
import { KPI } from '@/components/primitives';
import { fmtDate, fmtMs, fmtTokens, fmtUsd, shortId } from './format';
import { HonestyStateBadge, deriveHonestyState } from './HonestyStateBadge';
import { useDelegationRunContext } from './DelegationRunContext';

export function DelegationRunHeader() {
  const { snapshot, selectedRun, isFixture } = useDelegationRunContext();
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

  const freshness = snapshot.probes.map((p) => p.capturedAt).filter(Boolean).sort().at(-1);
  const isDegraded = snapshot.primaryError != null || stale > 0;
  const pricingManifestVersion =
    selectedRun?.pricingManifestVersion ?? snapshot.savings?.pricing_manifest_version ?? 'pending';
  const artifactCount = snapshot.decisions.length + snapshot.probes.filter((p) => p.rowCount > 0).length;
  const dataSource = isFixture ? 'fixture' : 'live projection';
  const terminalState =
    selectedRun?.status === 'passed' || selectedRun?.status === 'failed'
      ? selectedRun.status
      : selectedRun
        ? 'projected'
        : 'none';

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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isDegraded && (
              <Text as="span" size="xs" color="warn">
                degraded
              </Text>
            )}
            <Text as="span" size="xs" family="mono" color="tertiary">
              {dataSource}
            </Text>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Text as="div" size="xs" color="tertiary">
              Latest projection
            </Text>
            <Text as="div" size="sm" family="mono" color="secondary">
              {fmtDate(freshness)}
            </Text>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
        <KPI label="Runs" value={snapshot.runs.length} caption={`${passed} pass / ${failed} fail / ${projected} projected`} />
        <KPI label="Quality pass" value={Math.round(qualityPassRate * 100)} suffix="%" tone={qualityPassRate >= 0.8 ? 'good' : 'warn'} />
        <KPI label="Savings" value={savingsUsd} prefix="$" decimals={4} tone="good" caption={pricingManifestVersion} />
        <KPI label="Tokens" value={totalTokens} caption={fmtTokens(totalTokens)} />
        <KPI label="Latency" value={latencyMs} suffix="ms" caption={fmtMs(latencyMs)} />
        <KPI label="Artifacts" value={artifactCount} caption={`${snapshot.probes.length} probes`} tone={isDegraded ? 'warn' : 'default'} />
      </div>

      {selectedRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <MiniFact label="Model" value={selectedRun.modelName} />
          <MiniFact label="Terminal state" value={terminalState} tone={terminalState === 'failed' ? 'bad' : terminalState === 'passed' ? 'ok' : 'secondary'} />
          <MiniFact label="Cost" value={fmtUsd(selectedRun.estimatedCostUsd)} />
          <MiniFact label="Routing" value={selectedRun.routingRule ?? 'projection inferred'} />
          <MiniFact label="Pricing manifest" value={pricingManifestVersion} />
        </div>
      )}

      {!selectedRun && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <MiniFact label="Terminal state" value={terminalState} />
          <MiniFact label="Pricing manifest" value={pricingManifestVersion} />
          <MiniFact label="Live probes" value={`${provisioned} / ${snapshot.probes.length}`} tone={stale > 0 ? 'bad' : 'secondary'} />
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
