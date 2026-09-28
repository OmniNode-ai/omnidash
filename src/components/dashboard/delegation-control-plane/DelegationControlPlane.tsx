import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { DelegationRunHeader } from './DelegationRunHeader';
import { DelegationRunTable } from './DelegationRunTable';
import { DelegationEvidenceTabs } from './DelegationEvidenceTabs';
import { DelegationMetricPanels } from './DelegationMetricPanels';
import { DelegationRunProvider, useDelegationRunContext } from './DelegationRunContext';
import { useDataSourceMode, isLiveDataSource } from '@/hooks/useDataSourceMode';
import { ExecutionGraphTransportProvider } from './execution-graph-spike/ExecutionGraphTransport';
import { createLiveExecutionGraphTransport } from '@/services/execution-graph-workflow';
import type { DelegationControlPlaneConfig } from './delegation-control-plane.types';

const DEFAULT_MAX_RUNS = 12;
const liveExecutionGraphTransport = createLiveExecutionGraphTransport();

function DelegationControlPlaneInner({ config }: { config: DelegationControlPlaneConfig }) {
  const { snapshot, selectedRun, selectRun, filteredRuns } = useDelegationRunContext();
  const maxRuns = Math.max(1, Math.trunc(config.maxRuns ?? DEFAULT_MAX_RUNS));
  const dataSourceMode = useDataSourceMode();

  return (
    <ComponentWrapper
      title="Delegation Control Plane"
      isLive={isLiveDataSource(dataSourceMode)}
      fileMode={!isLiveDataSource(dataSourceMode)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {snapshot.isLoading && !snapshot.hasAnyData && (
          <Text as="div" size="lg" color="tertiary">Loading...</Text>
        )}
        {snapshot.primaryError && !snapshot.isLoading && (
          <Text as="div" size="lg" color="bad">Error: {snapshot.primaryError.message}</Text>
        )}
        {!snapshot.isLoading && !snapshot.primaryError && !snapshot.hasAnyData && (
          <div>
            <Text as="div" size="lg" color="tertiary">No delegation evidence rows</Text>
            <Text as="div" size="md" color="tertiary" style={{ marginTop: 4 }}>
              Run the market delegation golden chain to populate command, decision, savings, quality, and token projections. In file mode, add fixture files under fixtures/onex.snapshot.projection.delegation.*/
            </Text>
          </div>
        )}
        <DelegationRunHeader />
        <DelegationRunTable
          runs={filteredRuns}
          selectedRunId={selectedRun?.id ?? null}
          maxRuns={maxRuns}
          onSelectRun={selectRun}
        />
        {isLiveDataSource(dataSourceMode) ? (
          <ExecutionGraphTransportProvider transport={liveExecutionGraphTransport}>
            <DelegationEvidenceTabs />
          </ExecutionGraphTransportProvider>
        ) : <DelegationEvidenceTabs />}
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
