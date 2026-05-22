import { useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { DelegationRunHeader } from './DelegationRunHeader';
import { DelegationRunTable } from './DelegationRunTable';
import { DelegationEvidenceTabs } from './DelegationEvidenceTabs';
import { DelegationMetricPanels } from './DelegationMetricPanels';
import { DelegationRunProvider, useDelegationRunContext } from './DelegationRunContext';
import type {
  DelegationControlPlaneConfig,
  DelegationEvidenceTabId,
} from './delegation-control-plane.types';

const DEFAULT_MAX_RUNS = 12;
const DEFAULT_TAB: DelegationEvidenceTabId = 'projection';

function DelegationControlPlaneInner({ config }: { config: DelegationControlPlaneConfig }) {
  const { snapshot, selectedRun, selectRun, filteredRuns } = useDelegationRunContext();
  const maxRuns = Math.max(1, Math.trunc(config.maxRuns ?? DEFAULT_MAX_RUNS));
  const [activeTab, setActiveTab] = useState<DelegationEvidenceTabId>(config.defaultTab ?? DEFAULT_TAB);

  const isInitialLoading = snapshot.isLoading && !snapshot.hasAnyData;

  return (
    <ComponentWrapper
      title="Delegation Control Plane"
      isLoading={isInitialLoading}
      error={snapshot.primaryError}
      isEmpty={!snapshot.isLoading && !snapshot.hasAnyData}
      emptyMessage="No delegation evidence rows"
      emptyHint="Run the market delegation golden chain to populate command, decision, savings, quality, and token projections."
      isLive
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DelegationRunHeader snapshot={snapshot} selectedRun={selectedRun} />
        <DelegationRunTable
          runs={filteredRuns}
          selectedRunId={selectedRun?.id ?? null}
          maxRuns={maxRuns}
          onSelectRun={selectRun}
        />
        <DelegationEvidenceTabs
          activeTab={activeTab}
          snapshot={snapshot}
          selectedRun={selectedRun}
          onTabChange={setActiveTab}
        />
        <DelegationMetricPanels snapshot={snapshot} />
      </div>
    </ComponentWrapper>
  );
}

export default function DelegationControlPlane({
  config,
}: {
  config: DelegationControlPlaneConfig;
}) {
  return (
    <DelegationRunProvider>
      <DelegationControlPlaneInner config={config} />
    </DelegationRunProvider>
  );
}
