import type { ReactNode } from 'react';
import { Text } from '@/components/ui/typography';
import { fmtDate } from './format';
import { DelegationPanelFrame, EmptyPanel } from './DelegationPanelFrame';
import type { DelegationEvidenceSnapshot } from './delegation-control-plane.types';

export function DelegationRuntimeTopologyPanel({ snapshot }: { snapshot: DelegationEvidenceSnapshot }) {
  const observedProbes = snapshot.probes.filter((probe) => probe.rowCount > 0);
  const pendingProbes = snapshot.probes.filter((probe) => probe.rowCount === 0);
  const pricingVersion = snapshot.savings?.pricing_manifest_version;
  const capturedAt = snapshot.probes.map((p) => p.capturedAt).filter(Boolean).sort().at(-1);
  const provisionedCount = snapshot.probes.filter((p) => p.provisioned === true).length;
  const unprovisionedCount = snapshot.probes.filter((p) => p.provisioned === false).length;

  if (!snapshot.hasAnyData && !snapshot.isLoading) {
    return (
      <DelegationPanelFrame
        title="Runtime Topology"
        subtitle="Instance, package identity, owned and subscribed topics, contract hashes."
      >
        <EmptyPanel message="No projection data — run the market delegation golden chain to populate runtime topology." />
      </DelegationPanelFrame>
    );
  }

  return (
    <DelegationPanelFrame
      title="Runtime Topology"
      subtitle="Instance, package identity, owned and subscribed topics, contract hashes."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TopologySection label="Runtime identity">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <TopologyFact label="Runtime class" value="DelegationMarketOrchestrator" />
            <TopologyFact label="Package" value="omnimarket" />
            <TopologyFact label="Contract version" value={pricingVersion ?? 'pending'} />
            <TopologyFact label="Probes live" value={`${provisionedCount} / ${snapshot.probes.length}`} />
            <TopologyFact
              label="Unprovisioned"
              value={unprovisionedCount > 0 ? String(unprovisionedCount) : 'none'}
              tone={unprovisionedCount > 0 ? 'warn' : 'secondary'}
            />
            <TopologyFact label="Captured at" value={fmtDate(capturedAt)} />
          </div>
        </TopologySection>

        <TopologySection label={`Owned topics (${observedProbes.length} with data)`}>
          {observedProbes.length === 0 ? (
            <Text as="div" size="xs" color="tertiary">No owned topic projections observed yet.</Text>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {observedProbes.map((probe) => (
                <div key={probe.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                  <Text
                    as="span"
                    size="xs"
                    family="mono"
                    color="secondary"
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={probe.topic}
                  >
                    {probe.topic}
                  </Text>
                  <Text as="span" size="xs" family="mono" color="ok">
                    {probe.rowCount} row{probe.rowCount === 1 ? '' : 's'}
                  </Text>
                </div>
              ))}
            </div>
          )}
        </TopologySection>

        {pendingProbes.length > 0 && (
          <TopologySection label={`Pending topics (${pendingProbes.length} awaiting data)`}>
            <div style={{ display: 'grid', gap: 4 }}>
              {pendingProbes.map((probe) => (
                <div key={probe.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                  <Text
                    as="span"
                    size="xs"
                    family="mono"
                    color="tertiary"
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={probe.topic}
                  >
                    {probe.topic}
                  </Text>
                  <Text as="span" size="xs" family="mono" color={probe.isLoading ? 'secondary' : 'tertiary'}>
                    {probe.isLoading ? 'loading' : 'empty'}
                  </Text>
                </div>
              ))}
            </div>
          </TopologySection>
        )}

        <TopologySection label={`Subscribed topics (${snapshot.probes.length} total)`}>
          <Text as="div" size="xs" color="tertiary">
            {snapshot.probes.length} topics subscribed — {observedProbes.length} returning data, {pendingProbes.length} pending.
          </Text>
        </TopologySection>

        <Text as="div" size="xs" color="tertiary">
          Contract hashes and per-topic version identifiers are projection-derived. Full contract identity is sourced from the omnimarket node contract.yaml at deploy time.
        </Text>
      </div>
    </DelegationPanelFrame>
  );
}

function TopologySection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text as="div" size="xs" color="tertiary" style={{ marginBottom: 6 }}>{label}</Text>
      {children}
    </div>
  );
}

function TopologyFact({ label, value, tone = 'secondary' }: { label: string; value: string; tone?: 'secondary' | 'warn' | 'ok' }) {
  return (
    <div>
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="sm" family="mono" color={tone}>{value}</Text>
    </div>
  );
}
