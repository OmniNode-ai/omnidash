import type { Meta, StoryObj } from '@storybook/react';
import { ExecutionGraphView } from './ExecutionGraphView';
import { ExecutionGraphTransportProvider } from './ExecutionGraphTransport';
import { provisionalExecutionGraph } from './__fixtures__/provisionalGraph';

const laterGraph = {
  ...provisionalExecutionGraph,
  replay: {
    ...provisionalExecutionGraph.replay,
    source_cursors: [{ ...provisionalExecutionGraph.replay.source_cursors[0], max_ingest_seq: 3 }],
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
