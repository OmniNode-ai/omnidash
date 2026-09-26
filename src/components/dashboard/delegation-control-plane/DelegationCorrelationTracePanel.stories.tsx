import type { Meta, StoryObj } from '@storybook/react';
import { DelegationCorrelationTracePanel } from './DelegationCorrelationTracePanel';
import {
  DelegationRunContextValueProvider,
  type DelegationRunContextValue,
} from './DelegationRunContext';
import {
  ExecutionGraphTransportProvider,
  type ExecutionGraphTransport,
} from './execution-graph-spike/ExecutionGraphTransport';
import type { ModelExecutionGraph } from './execution-graph-spike/render-model';
import realFiveHopGraphJson from './execution-graph-spike/__fixtures__/realFiveHopGraph.json';

const graph = realFiveHopGraphJson as unknown as ModelExecutionGraph;
const correlationId = graph.replay.correlation_id;

const fixtureContext: DelegationRunContextValue = {
  snapshot: {
    summary: null,
    savings: null,
    modelRouting: null,
    qualityGate: null,
    tokenUsage: null,
    decisions: [],
    runs: [],
    probes: [],
    hasAnyData: false,
    isLoading: false,
    primaryError: null,
  },
  selectedRunId: correlationId,
  selectedRun: {
    id: correlationId,
    correlationId,
    taskType: 'code_review',
    modelName: 'fixture-model',
    status: 'passed',
    source: 'decision_projection',
  },
  filter: { taskType: null, status: null },
  filteredRuns: [],
  selectRun: () => undefined,
  setFilter: () => undefined,
  clearFilter: () => undefined,
  isFixture: true,
  pendingCorrelationId: null,
  setPendingCorrelationId: () => undefined,
};

const fixtureTransport: ExecutionGraphTransport = {
  readLatest: async () => graph,
  step: async () => null,
};

const meta = {
  title: 'Delegation/Correlation Trace Panel',
  component: DelegationCorrelationTracePanel,
  render: () => (
    <DelegationRunContextValueProvider value={fixtureContext}>
      <ExecutionGraphTransportProvider transport={fixtureTransport}>
        <div style={{ margin: 24, maxWidth: 1400 }}>
          <DelegationCorrelationTracePanel />
        </div>
      </ExecutionGraphTransportProvider>
    </DelegationRunContextValueProvider>
  ),
} satisfies Meta<typeof DelegationCorrelationTracePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full-panel composition with a fold fixture and injected transport only. */
export const RealFiveHopFixture: Story = {};
