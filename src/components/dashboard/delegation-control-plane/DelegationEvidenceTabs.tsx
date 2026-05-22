import { Activity, Database, FileCheck2, Network, Package } from 'lucide-react';
import type { ComponentType } from 'react';
import { Text } from '@/components/ui/typography';
import { DelegationProjectionStatus } from './DelegationProjectionStatus';
import { DelegationEventChainPanel } from './DelegationEventChainPanel';
import { DelegationRuntimeTopologyPanel } from './DelegationRuntimeTopologyPanel';
import { DelegationArtifactPanel } from './DelegationArtifactPanel';
import { DelegationEvidenceBundlePanel } from './DelegationEvidenceBundlePanel';
import type {
  DelegationEvidenceSnapshot,
  DelegationEvidenceTabId,
  DelegationRun,
} from './delegation-control-plane.types';

const TABS: Array<{ id: DelegationEvidenceTabId; label: string; Icon: ComponentType<{ size?: number }> }> = [
  { id: 'projection', label: 'Projection Probe', Icon: Database },
  { id: 'event-chain', label: 'Event Chain', Icon: Activity },
  { id: 'runtime-topology', label: 'Runtime Topology', Icon: Network },
  { id: 'artifacts', label: 'Artifacts', Icon: Package },
  { id: 'evidence-bundle', label: 'Evidence Bundle', Icon: FileCheck2 },
];

export function DelegationEvidenceTabs({
  activeTab,
  snapshot,
  selectedRun,
  onTabChange,
}: {
  activeTab: DelegationEvidenceTabId;
  snapshot: DelegationEvidenceSnapshot;
  selectedRun: DelegationRun | null;
  onTabChange: (tab: DelegationEvidenceTabId) => void;
}) {
  return (
    <section>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 12 }}>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            aria-pressed={activeTab === id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '6px 9px',
              background: activeTab === id ? 'var(--panel-2)' : 'transparent',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <Icon size={14} />
            <Text as="span" size="xs" color="primary">{label}</Text>
          </button>
        ))}
      </div>
      {activeTab === 'projection' && <DelegationProjectionStatus probes={snapshot.probes} />}
      {activeTab === 'event-chain' && <DelegationEventChainPanel snapshot={snapshot} selectedRun={selectedRun} />}
      {activeTab === 'runtime-topology' && <DelegationRuntimeTopologyPanel snapshot={snapshot} />}
      {activeTab === 'artifacts' && <DelegationArtifactPanel snapshot={snapshot} selectedRun={selectedRun} />}
      {activeTab === 'evidence-bundle' && <DelegationEvidenceBundlePanel snapshot={snapshot} selectedRun={selectedRun} />}
    </section>
  );
}
