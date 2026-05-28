import { ComponentWrapper } from '../ComponentWrapper';
import { DelegationRunHeader } from './DelegationRunHeader';
import { DelegationRunTable } from './DelegationRunTable';
import { DelegationEvidenceTabs } from './DelegationEvidenceTabs';
import { DelegationMetricPanels } from './DelegationMetricPanels';
import { DelegationRunProvider, useDelegationRunContext } from './DelegationRunContext';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import type { DelegationControlPlaneConfig } from './delegation-control-plane.types';

const DEFAULT_MAX_RUNS = 12;

function DelegationControlPlaneInner({ config }: { config: DelegationControlPlaneConfig }) {
  const { snapshot, selectedRun, selectRun, filteredRuns } = useDelegationRunContext();
  const maxRuns = Math.max(1, Math.trunc(config.maxRuns ?? DEFAULT_MAX_RUNS));
  const dataSourceMode = useDataSourceMode();

  const isInitialLoading = snapshot.isLoading && !snapshot.hasAnyData;

  return (
    <ComponentWrapper
      title="Delegation Control Plane"
      isLoading={isInitialLoading}
      error={snapshot.primaryError}
      isEmpty={!snapshot.isLoading && !snapshot.hasAnyData}
      emptyMessage="No delegation evidence rows"
      emptyHint="Run the market delegation golden chain to populate command, decision, savings, quality, and token projections. In file mode, add fixture files under fixtures/onex.snapshot.projection.delegation.*/"
      isLive={isLiveDataSource(dataSourceMode)}
      fileMode={!isLiveDataSource(dataSourceMode)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DelegationRunHeader />
        <DelegationRunTable
          runs={filteredRuns}
          selectedRunId={selectedRun?.id ?? null}
          maxRuns={maxRuns}
          onSelectRun={selectRun}
        />
        <DelegationEvidenceTabs />
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
