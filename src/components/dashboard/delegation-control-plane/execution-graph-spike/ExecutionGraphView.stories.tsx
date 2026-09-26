import type { Meta, StoryObj } from '@storybook/react';
import { ExecutionGraphView } from './ExecutionGraphView';
import { ExecutionGraphTransportProvider } from './ExecutionGraphTransport';
import type { ModelExecutionGraph } from './render-model';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';
import realFiveHopGraphJson from './__fixtures__/realFiveHopGraph.json';

const realFiveHopGraph = realFiveHopGraphJson as unknown as ModelExecutionGraph;

const laterGraph = {
  ...provisionalExecutionGraph,
  replay: {
    ...provisionalExecutionGraph.replay,
    source_cursors: [{ ...provisionalExecutionGraph.replay.source_cursors[0], max_kafka_offset: 43 }],
  },
};

const meta = {
  title: 'Delegation/Execution Graph View',
  component: ExecutionGraphView,
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => provisionalExecutionGraph,
        step: async (_correlationId, _currentCursors, direction) => direction === 'next' ? laterGraph : null,
      }}>
        <div style={{ margin: 24, maxWidth: 1000 }}><Story /></div>
      </ExecutionGraphTransportProvider>
    ),
  ],
} satisfies Meta<typeof ExecutionGraphView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Test/story input only; replace with a real core-fold fixture before visual sign-off. */
export const Provisional: Story = { args: { correlationId: 'corr-provisional-001' } };

/** Render the exact Core fold fixture; this transport exposes no adjacent bounds. */
export const RealFiveHopFixture: Story = {
  args: { correlationId: realFiveHopGraph.replay.correlation_id },
  decorators: [
    (Story) => (
      <ExecutionGraphTransportProvider transport={{
        readLatest: async () => realFiveHopGraph,
        step: async () => null,
      }}>
        <div style={{ margin: 24, maxWidth: 1400 }}><Story /></div>
      </ExecutionGraphTransportProvider>
    ),
  ],
};
