import { Text } from '@/components/ui/typography';
import { DelegationPanelFrame } from './DelegationPanelFrame';
import type { DelegationEvidenceSnapshot } from './delegation-control-plane.types';

export function DelegationRuntimeTopologyPanel({ snapshot }: { snapshot: DelegationEvidenceSnapshot }) {
  const observedTopics = snapshot.probes.filter((probe) => probe.rowCount > 0);
  const missingTopics = snapshot.probes.filter((probe) => probe.rowCount === 0);

  return (
    <DelegationPanelFrame
      title="Runtime Topology"
      subtitle="Projection-facing topology assembled from current dashboard reads."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
        <TopologyFact label="Observed topics" value={String(observedTopics.length)} />
        <TopologyFact label="Pending topics" value={String(missingTopics.length)} />
        <TopologyFact label="Decision rows" value={String(snapshot.decisions.length)} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Text as="div" size="xs" color="tertiary" style={{ marginBottom: 6 }}>
          Subscribed projection topics
        </Text>
        <div style={{ display: 'grid', gap: 5 }}>
          {snapshot.probes.map((probe) => (
            <Text key={probe.key} as="div" size="xs" family="mono" color={probe.rowCount > 0 ? 'secondary' : 'tertiary'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={probe.topic}>
              {probe.topic}
            </Text>
          ))}
        </div>
      </div>
      <Text as="div" size="xs" color="tertiary" style={{ marginTop: 10 }}>
        Runtime instance, owned topics, subscribed topics, and contract hashes are placeholders until the runtime topology projection is exposed to OmniDash.
      </Text>
    </DelegationPanelFrame>
  );
}

function TopologyFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text as="div" size="xs" color="tertiary">{label}</Text>
      <Text as="div" size="lg" family="mono" color="primary">{value}</Text>
    </div>
  );
}
