import { useEffect, useMemo, useState } from 'react';
import { ComponentWrapper } from '../ComponentWrapper';
import { DelegationRunHeader } from './DelegationRunHeader';
import { DelegationRunTable } from './DelegationRunTable';
import { DelegationEvidenceTabs } from './DelegationEvidenceTabs';
import { DelegationMetricPanels } from './DelegationMetricPanels';
import { useDelegationEvidenceSnapshot } from './useDelegationEvidenceSnapshot';
import type {
  DelegationControlPlaneConfig,
  DelegationEvidenceTabId,
} from './delegation-control-plane.types';

const DEFAULT_MAX_RUNS = 12;
const DEFAULT_TAB: DelegationEvidenceTabId = 'projection';

export default function DelegationControlPlane({
  config,
}: {
  config: DelegationControlPlaneConfig;
}) {
  const snapshot = useDelegationEvidenceSnapshot();
  const maxRuns = Math.max(1, Math.trunc(config.maxRuns ?? DEFAULT_MAX_RUNS));
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DelegationEvidenceTabId>(config.defaultTab ?? DEFAULT_TAB);

  useEffect(() => {
    if (!selectedRunId && snapshot.runs[0]) {
      setSelectedRunId(snapshot.runs[0].id);
    }
  }, [selectedRunId, snapshot.runs]);

  const selectedRun = useMemo(() => {
    return snapshot.runs.find((run) => run.id === selectedRunId) ?? snapshot.runs[0] ?? null;
  }, [selectedRunId, snapshot.runs]);

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
          runs={snapshot.runs}
          selectedRunId={selectedRun?.id ?? null}
          maxRuns={maxRuns}
          onSelectRun={setSelectedRunId}
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
