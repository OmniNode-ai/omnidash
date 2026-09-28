import { DelegationRunProvider, useDelegationRunContext } from '@/components/dashboard/delegation-control-plane/DelegationRunContext';
import { ExecutionGraphWorkspace } from '@/components/dashboard/delegation-control-plane/execution-graph-spike/ExecutionGraphWorkspace';
import { ExecutionGraphTransportProvider } from '@/components/dashboard/delegation-control-plane/execution-graph-spike/ExecutionGraphTransport';
import { createLiveExecutionGraphTransport } from '@/services/execution-graph-workflow';
import { isLiveDataSource, useDataSourceMode } from '@/hooks/useDataSourceMode';

const transport = createLiveExecutionGraphTransport();

export function ExecutionGraphPageContent() {
  const { snapshot, selectedRun } = useDelegationRunContext();
  const mode = useDataSourceMode();
  if (!isLiveDataSource(mode)) return <main><h1>Execution graph</h1><p>Select a live data source to browse recorded executions.</p><a href="/">Back to dashboard</a></main>;
  if (!selectedRun) return <main><h1>Execution graph</h1><p role="status">
    {snapshot.isLoading ? 'Loading recorded executions…' : snapshot.primaryError ? 'Recorded executions could not be loaded.' : 'No recorded executions are available.'}
  </p><a href="/">Back to dashboard</a></main>;
  return <ExecutionGraphTransportProvider transport={transport}>
    <ExecutionGraphWorkspace correlationId={selectedRun.correlationId} runs={snapshot.runs} isFixture={false} onExit={() => window.location.assign('/')} />
  </ExecutionGraphTransportProvider>;
}

/** Direct entry uses the existing authorized run projection; no manually entered ID. */
export function ExecutionGraphPage() {
  return <DelegationRunProvider><ExecutionGraphPageContent /></DelegationRunProvider>;
}
